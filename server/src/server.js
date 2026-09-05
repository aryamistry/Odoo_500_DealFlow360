// src/server.js — Entry point
const app = require('./app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`DealFlow360 server running on http://localhost:${PORT}`);
});
