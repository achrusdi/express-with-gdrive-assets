import { google } from 'googleapis';
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });
// dotenv.config({path: `.env.${process.env.NODE_ENV}`});

const app = express();

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.CLIENT_URI,
);

try {
    const creds = fs.readFileSync("creds.json");
    oauth2Client.setCredentials(JSON.parse(creds));
} catch (error) {
    console.log('No creds found');
}

const PORT = process.env.PORT || 3007;

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

app.get('/saveText/:sometext', async (req, res) => {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sometext = req.params.sometext;

    await drive.files.create({
        requestBody: {
            name: 'test.txt',
            mimeType: 'text/plain'
        },
        media: {
            mimeType: 'text/plain',
            body: sometext
        }
    });

    // return "Success";
    res.send('Success');

});

app.get('/saveImage', async (req, res) => {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    drive.files.create({
        requestBody: {
            name: 'uploaded.jpg',
            mimeType: 'image/jpeg'
        },
        media: {
            mimeType: 'image/jpeg',
            body: fs.createReadStream('Sunflower_from_Silesia2.jpg')
        }
    });

    res.send('Success');
})

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
})