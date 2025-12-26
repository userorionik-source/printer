const WebSocket = require('ws');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

const PORT = 9988;
const AUTH_TOKEN = 'supersecret';

/* ============================
   ESC/POS CONSTANTS
============================ */
const ESC = 0x1B;
const DRAWER_KICK = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]);
const CUT_PAPER = Buffer.from([ESC, 0x69]);

/* ============================
   TEST RECEIPT (FIXED)
============================ */
const TEST_RECEIPT =
`AARAVPOS TEST PRINT
------------------------
Printer OK
ESC/POS OK
------------------------
Thank you!
`;

/* ============================
   BUILD BUFFER
============================ */
function buildBuffer(text, openDrawer = false) {
  const ESC = 0x1B;
  const LF = 0x0A;

  const DRAWER_KICK = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]);
  const FEED_AND_CUT = Buffer.from([
    LF, LF, LF, LF,   // IMPORTANT: flush printer buffer
    ESC, 0x69         // full cut
  ]);

  const parts = [
    Buffer.from(text, 'ascii'),
    Buffer.from([LF, LF])
  ];

  if (openDrawer) {
    parts.push(DRAWER_KICK);
  }

  parts.push(FEED_AND_CUT);

  return Buffer.concat(parts);
}


/* ============================
   PRINT ROUTER
============================ */
function printRaw(printerName, buffer) {
  const platform = os.platform();

  if (platform === 'darwin' || platform === 'linux') {
    const file = '/tmp/receipt.raw';
    fs.writeFileSync(file, buffer);
    exec(`lp -d "${printerName}" -o raw "${file}"`);
  }

  if (platform === 'win32') {
    const dir = 'C:\\temp';
    const file = `${dir}\\receipt.raw`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    fs.writeFileSync(file, buffer);
    exec(`cmd /c copy /b "${file}" "\\\\localhost\\${printerName}"`);
  }
}

/* ============================
   PRINTER DISCOVERY
============================ */
function getPrinters(callback) {
  const platform = os.platform();

  if (platform === 'win32') {
    exec('wmic printer get Name,Default', (err, stdout) => {
      const lines = stdout.split('\n').slice(1);
      const printers = lines
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => ({
          name: l.replace('TRUE', '').trim(),
          status: 'READY'
        }));
      callback(printers);
    });
  } else {
    exec('lpstat -p -d', (err, stdout) => {
      const printers = [];
      stdout.split('\n').forEach(line => {
        if (line.startsWith('printer ')) {
          printers.push({
            name: line.split(' ')[1],
            status: 'READY'
          });
        }
      });
      callback(printers);
    });
  }
}

/* ============================
   WEBSOCKET SERVER
============================ */
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  if (params.get('token') !== AUTH_TOKEN) {
    ws.close();
    return;
  }

  ws.send(JSON.stringify({ type: 'connected' }));

  ws.on('message', msg => {
    const data = JSON.parse(msg);

    /* ---------- HEALTH ---------- */
    if (data.type === 'health') {
      getPrinters(printers => {
        ws.send(JSON.stringify({
          type: 'health_response',
          payload: {
            ok: true,
            platform: os.platform(),
            printers,
            totalPrinters: printers.length,
            defaultPrinter: printers[0]?.name || null
          }
        }));
      });
    }

    /* ---------- PRINT TEXT ---------- */
    if (data.type === 'print_text') {
      const { printerName, text } = data.payload;
      const buffer = buildBuffer(text, false);
      printRaw(printerName, buffer);

      ws.send(JSON.stringify({
        type: 'print_response',
        payload: { success: true, message: 'Printed text successfully' }
      }));
    }

    /* ---------- TEST PRINT ---------- */
    if (data.type === 'test_print') {
      const { printerName } = data.payload;
      const buffer = buildBuffer(TEST_RECEIPT, false);
      printRaw(printerName, buffer);

      ws.send(JSON.stringify({
        type: 'test_print_response',
        payload: { success: true, message: 'Test print sent' }
      }));
    }

    /* ---------- OPEN CASH DRAWER ---------- */
    if (data.type === 'open_cash_drawer') {
      const { printerName } = data.payload;
      const buffer = buildBuffer(TEST_RECEIPT, true);
      printRaw(printerName, buffer);

      ws.send(JSON.stringify({
        type: 'cash_drawer_response',
        payload: { success: true, message: 'Drawer opened with receipt' }
      }));
    }
  });
});

console.log(`🖨️ AaravPOS Print Server running on ws://localhost:${PORT}`);
