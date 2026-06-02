import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const tmp = path.join(process.cwd(), 'tmp-upload.txt');
fs.writeFileSync(tmp, 'test upload');

const form = new FormData();
form.append('image', fs.createReadStream(tmp));

try {
  const res = await fetch('http://localhost:4000/api/upload-profile', { method: 'POST', body: form });
  console.log('status', res.status);
  console.log(await res.text());
} catch (err) {
  console.error(err);
} finally {
  fs.unlinkSync(tmp);
}
