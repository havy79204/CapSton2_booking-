console.log('Starting server with debug logging...');

// Override console.log to show timestamps
const originalLog = console.log;
console.log = function(...args) {
  const timestamp = new Date().toISOString();
  originalLog(`[${timestamp}]`, ...args);
};

// Start the server
require('./src/server.js');
