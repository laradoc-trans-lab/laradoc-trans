const fs = require('fs-extra');
const path = require('path');

const sourceDir = path.join(__dirname, '..' , 'src', 'i18n');
const destDir = path.join(__dirname, '..' , 'dist', 'i18n');

fs.copy(sourceDir, destDir, { overwrite: true }, (err) => {
  if (err) {
    console.error('Error copying i18n assets:', err);
    process.exit(1);
  }
  console.log('i18n assets copied successfully!');
});