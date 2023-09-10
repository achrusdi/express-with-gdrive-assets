import express from 'express';
import auth from 'google-auth-library';
import multer from 'multer';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const app = express();

const client = new auth.OAuth2Client(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.CLIENT_URI,
);

const uri = process.env.NODE_MONGO_URL;
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'temp/assets');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const User = mongoose.model('User2', {
    email: String,
    password: String,
    profile_id: String,
    profile_photo_path: String,
})

const router = express.Router();

router.post('/register', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).send('Email dan password harus diisi!');
    }

    const user = new User({
        email,
        password,
    });

    const upload = multer({ storage });
    upload.single('profile_photo', {
        required: true,
    });

    upload.fields([
        { name: 'profile_photo', maxCount: 1 },
        { name: 'profile_photo_path', maxCount: 1 },
    ]);

    upload.any().on('file', (file) => {
        console.log('====================================');
        console.log('File upload: ' + file.originalname);
        console.log('====================================');
    });

    upload.post('/profile', (req, res) => {
        client.uploadFile({
            url: `https://www.googleapis.com/drive/v3/files`,
            headers: {
                'Authorization': `Bearer ${req.session.accessToken}`
            },
            filePath: req.file.path,
        }).then((response) => {
            user.profile_id = response.data.id;
            user.profile_photo_path = req.body.profile_photo_path;

            user.save().then(() => {
                client.getAccessToken(req.body.code).then((accessToken) => {
                    req.session.accessToken = accessToken;
                    res.status(201).json({
                        accessToken
                    });
                }, (error) => {
                    res.status(500).send(error);
                });
            }, (error) => {
                res.status(500).send(error);
            });
        }, (error) => {
            res.status(500).send(error);
        });
    });
});

router.post('/login', (req, res) => {
    client.getAccessToken(req.body.code).then((accessToken) => {
        // Simpan token di sesi
        req.session.accessToken = accessToken;

        // Kirim response
        res.status(200).json({
            accessToken,
        });
    }, (error) => {
        // Kirim error
        res.status(500).send(error);
    });
});

// Route untuk mendapatkan foto profil
router.get('/profile', (req, res) => {
    // Dapatkan token dari sesi
    const accessToken = req.session.accessToken;

    // Dapatkan foto profil dari Google Drive
    client.get({
        url: `https://www.googleapis.com/drive/v3/files/${req.user.profile_id}/thumbnails/160x160`,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    }).then((response) => {
        // Kirim foto profil
        res.status(200).send(response.data.thumbnailLink);
    }, (error) => {
        // Terjadi kesalahan saat mendapatkan foto profil
        res.status(500).send(error);
    });
});

const PORT = process.env.PORT || 3007;

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
})