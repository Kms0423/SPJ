const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

require('dotenv').config();

const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://softwareproject2-4e1af-default-rtdb.firebaseio.com/',
    storageBucket: 'gs://softwareproject2-4e1af.appspot.com'
  });
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
    }
  }
});

app.post('/submit-report', upload.single('chooseFile'), (req, res) => {
  const { address, description, reportType, userId } = req.body;  

  if (!userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  admin.database().ref('reports').once('value')
    .then(snapshot => {
      const reportNumber = snapshot.numChildren() + 1;

      let imageUrl = '';
      if (req.file) {
        const bucket = admin.storage().bucket();
        const fileName = `${Date.now()}_${path.basename(req.file.originalname)}`;
        const file = bucket.file(fileName);

        file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          cacheControl: 'public, max-age=31536000'
        })
        .then(() => file.getSignedUrl({ action: 'read', expires: '03-09-2491' }))
        .then(urls => {
          imageUrl = urls[0];
          saveReportToDatabase(reportNumber, imageUrl);
        })
        .catch(error => {
          console.error('Image upload error:', error);
          res.status(500).json({ error: '이미지 업로드에 실패했습니다.' });
        });
      } else {
        saveReportToDatabase(reportNumber, imageUrl);
      }

      function saveReportToDatabase(reportNumber, imageUrl) {
        admin.database().ref('reports').push({
          reportNumber: reportNumber,
          address: address,
          description: description,
          reportType: reportType,
          imageUrl: imageUrl,
          userId: userId, 
          status: '접수',  
          timestamp: Date.now()
        })
        .then(() => {
          sendNotificationToUser(userId, `신고번호 ${reportNumber}번이 접수되었습니다.`);
          res.status(200).json({ message: '신고가 완료되었습니다!', reportNumber: reportNumber });
        })
        .catch(error => {
          console.error('Firebase error:', error);
          res.status(500).json({ error: '신고 저장에 실패했습니다.' });
        });
      }
    })
    .catch(error => {
      console.error('Firebase error:', error);
      res.status(500).json({ error: '신고번호 생성에 실패했습니다.' });
    });
});

function sendNotificationToUser(userId, message) {
  const newNotificationRef = admin.database().ref('notifications').push();
  newNotificationRef.set({
    userId: userId,
    message: message,
    timestamp: Date.now(),
    read: false
  });
}

admin.database().ref('reports').on('child_changed', (snapshot) => {
  const report = snapshot.val();
  console.log(`변경된 상태: ${report.status}`); 

  if (!report.userId || !report.status) {
      console.error('알림 생성에 필요한 데이터가 없습니다.');
      return;
  }

  if (report.status === '처리중') {
      console.log(`처리중 상태 감지: 신고번호 ${report.reportNumber}`);
      const message = `신고번호 ${report.reportNumber}번이 처리중입니다.`;
      admin.database().ref('notifications').push({
          userId: report.userId,
          message: message,
          timestamp: Date.now(),
          read: false,
      });
  } else if (report.status === '처리 완료') {
      console.log(`처리 완료 상태 감지: 신고번호 ${report.reportNumber}`);
      const message = `신고번호 ${report.reportNumber}번이 처리 완료되었습니다.`;
      admin.database().ref('notifications').push({
          userId: report.userId,
          message: message,
          timestamp: Date.now(),
          read: false,
      });
  }
});

app.get('/get-reports', (req, res) => {
  admin.database().ref('reports').once('value')
      .then(snapshot => {
          const reports = [];
          snapshot.forEach(childSnapshot => {
              const report = childSnapshot.val();
              reports.push({
                  reportNumber: report.reportNumber,
                  address: report.address,
                  description: report.description,
                  reportType: report.reportType,
                  imageUrl: report.imageUrl,
                  status: report.status,
                  userId: report.userId
              });
          });
          res.status(200).json(reports);
      })
      .catch(error => {
          console.error('Firebase error:', error);
          res.status(500).json({ error: '데이터 불러오기 실패' });
      });
});

app.listen(3000, () => {
  console.log('Server is running...');
});
