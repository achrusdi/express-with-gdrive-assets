import express from 'express';
import bodyParser from 'body-parser';
import multer from 'multer';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config({ path: '.env.local' });

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
})

const mongoUrl = process.env.NODE_MONGO_URL;

app.use(cors());
// const corsOptions = {
//     origin: 'http://localhost:3000',
//     credentials: true,            //access-control-allow-credentials:true
//     optionSuccessStatus: 200
// }
// app.use(cors(corsOptions));

// Konfigurasi MongoDB
mongoose.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Konfigurasi Google Drive API
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.CLIENT_URI;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
// const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const auth = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.CLIENT_URI,
);
const creds = fs.readFileSync("creds.json");
auth.setCredentials(JSON.parse(creds));

const drive = google.drive({ version: 'v3', auth });

// Konfigurasi Multer untuk mengunggah gambar
// const storage = multer.memoryStorage({
//     // destination: function (req, file, cb) {
//     //     cb(null, "public/assets");
//     // },
//     // filename: function (req, file, cb) {
//     //     // Ganti nama file dengan timestamp unik (misalnya, saat gambar diunggah)
//     //     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
//     //     const newFileName = uniqueSuffix + "-" + file.originalname;
//     //     cb(null, newFileName);
//     //     // cb(null, file.originalname);
//     // }
// });
// const upload = multer({ storage: storage });

// FILE STORAGE
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

// Registrasi pengguna
app.post('/register', async (req, res) => {
    console.log('====================================');
    console.log('register');
    console.log('====================================');
    try {
        const { username, password, email } = req.body;

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Simpan pengguna ke MongoDB
        const user = new User({
            username,
            password: passwordHash,
            email,
            // first_name,
            // last_name,
        });
        await user.save();

        res.status(201).json({ message: 'Registrasi berhasil' });
    } catch (error) {
        res.status(500).json({ error: 'Registrasi gagal' });
    }
});

// Login pengguna
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

// Pembaruan profil dengan unggah gambar ke Google Drive
// app.post('/update-profile', async (req, res) => {
app.post('/update-profile', upload.single('image'), async (req, res) => {
    // const drive = google.drive({ version: 'v3', auth });

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
                // body: imageFile.buffer,
            },
        });

        // Simpan path gambar dari Google Drive ke MongoDB
        // const imagePath = driveResponse.data.webContentLink;
        // const imagePath = await driveResponse.get().data.webContentLink;

        if (fs.existsSync(imageFile.path)) {
            fs.unlinkSync(imageFile.path);
        }

        const imageId = driveResponse.data.id;

        // Set the file to be publicly accessible
        // await driveResponse.setAcl({
        //     body: {
        //         role: 'reader',
        //         emailAddress: 'allUsers',
        //     },
        // });

        // Get the web content link of the file
        // const imagePath = await driveResponse.get().data.webContentLink;

        console.log('====================================');
        console.log(driveResponse);
        console.log(imageId);
        console.log('====================================');

        const imagePath = `https://drive.google.com/uc?id=${imageId}`;

        const test = await User.findByIdAndUpdate(user_id, { $set: { picturePath: imagePath } });
        // const test = await User.findById(user_id);
        console.log('====================================');
        console.log(test);
        console.log('====================================');

        res.status(200).json({ message: 'Profil berhasil diperbarui', imagePath });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Pembaruan profil gagal' });
    }
});

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
