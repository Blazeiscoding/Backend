import multer from "multer";

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./public/temp")
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname) // user may upload multiple files of same name , which may get overide
    }
  })
    
  const upload = multer({ 
    storage,
})
  