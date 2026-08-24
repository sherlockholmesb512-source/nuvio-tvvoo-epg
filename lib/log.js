'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'addon.log');

function write(line) {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) { /* ignore */ }
}

function log(tag, data) {
  const rec = { t: new Date().toISOString(), tag, ...(data || {}) };
  const line = JSON.stringify(rec);
  console.log(line);
  write(line);
}

function tail(n) {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').slice(-n);
  } catch (e) {
    return [];
  }
}

module.exports = { log, tail };
