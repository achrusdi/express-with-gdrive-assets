import { google } from 'googleapis';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import cors from 'cors';

// SETUP ENV
const env_type = process.argv[2] || 'local';
dotenv.config({ path: `.env.${env_type}` });

// DEFINING VARIABLES
const PORT = process.env.PORT || 3007;
const DRIVE_PARENT_ID = process.env.DRIVE_PARENT_ID;

// SETUP FILE STORAGE
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "public/assets");
    },
    filename: function (req, file, cb) {
        // Ganti nama file dengan timestamp unik (misalnya, saat gambar diunggah)
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        const newFileName = uniqueSuffix + "-" + file.originalname;
        cb(null, newFileName);
        // cb(null, file.originalname);
    }
});
const upload = multer({ storage });


// SETUP EXPRESS
const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
})
app.use(cors());

// SETUP OAUTH
const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.CLIENT_URI,
);

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// SETUP MONGO DB
const mongoUrl = process.env.NODE_MONGO_URL;
mongoose.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

/*
 * CHECK THE EXISTING OF CREDENTIAL
 * Credentials are automatically created when you log in with Oauth
*/
try {
    const creds = fs.readFileSync("creds.json");
    oauth2Client.setCredentials(JSON.parse(creds));
} catch (error) {
    console.log('No creds found');
}

/*
 * ACCESS THIS URL AND LOGIN TO CREATE CRED.JSON
 * Access directly on this server url (can be replaced by logging in on the client side)
*/
app.get("/auth/google", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/drive'
        ]
    });
    res.redirect(url);
});

app.get("/google/redirect", async (req, res) => {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync("creds.json", JSON.stringify(tokens));
    res.send("success");
});

// CREATE FILE .txt ON DRIVE FOR TEST
app.get('/saveText/:textName/:sometext', async (req, res) => {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sometext = req.params.sometext;

    await drive.files.create({
        requestBody: {
            name: `${req.params.textName}.txt`,
            mimeType: 'text/plain',
            parents: [DRIVE_PARENT_ID],
            // parents: ['1cboYUTBsYY9cwbFgoXPUXhkBDVb_VQrc'],
        },
        media: {
            mimeType: 'text/plain',
            body: sometext
        }
    });

    res.status(201).send('Success');
});

app.post('/update-profile', upload.single('image'), async (req, res) => {
    try {
        const { user_id } = req.body;
        const imageFile = req.file;

        // Upload gambar ke Google Drive
        const driveResponse = await drive.files.create({
            requestBody: {
                name: imageFile.filename,
                mimeType: imageFile.mimetype,
                parents: ['1cboYUTBsYY9cwbFgoXPUXhkBDVb_VQrc'],
            },
            media: {
                mimeType: imageFile.mimetype,
                body: fs.createReadStream(imageFile.path),
            },
        });

        if (fs.existsSync(imageFile.path)) {
            fs.unlinkSync(imageFile.path);
        }

        const imageId = driveResponse.data.id;

        const imagePath = `https://drive.google.com/uc?id=${imageId}`;

        const test = await User.findByIdAndUpdate(user_id, { $set: { picturePath: imagePath } });

        res.status(201).json({ message: 'Profil berhasil diperbarui', imagePath });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Pembaruan profil gagal' });
    }
});

// FOR TESTING
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Cari pengguna berdasarkan username
        const user = await User.findOne({ username });

        // Verifikasi password
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            // Buat token JWT
            const token = jwt.sign({ user_id: user._id }, 'your-secret-key', {
                expiresIn: '1h',
            });
            res.status(200).json({ token, id: user.id });
        } else {
            res.status(401).json({ error: 'Autentikasi gagal' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Autentikasi gagal' });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});