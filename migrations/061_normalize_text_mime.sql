UPDATE versions SET mime='text/html'
  WHERE mime IN ('text/plain','application/octet-stream')
    AND (filename LIKE '%.html' OR filename LIKE '%.htm');
UPDATE versions SET mime='text/css'
  WHERE mime IN ('text/plain','application/octet-stream') AND filename LIKE '%.css';
UPDATE versions SET mime='text/javascript'
  WHERE mime IN ('text/plain','application/octet-stream')
    AND (filename LIKE '%.js' OR filename LIKE '%.mjs');
UPDATE versions SET mime='image/svg+xml'
  WHERE mime IN ('text/plain','application/octet-stream') AND filename LIKE '%.svg';
UPDATE versions SET mime='application/json'
  WHERE mime IN ('text/plain','application/octet-stream') AND filename LIKE '%.json';
