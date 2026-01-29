import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, StopCircle, XCircle, Loader2, Printer, Play, RefreshCw, Check, X, AlertTriangle, Square, Home, Globe, Barcode, FlaskConical, DollarSign, Timer, Download, Monitor, FileText, Hourglass, Rocket, Scissors, Tag, Theater, Server, Cpu, Shield, ClipboardCheck, Wifi, WifiOff, Settings, Info, Bell, AlertCircle, ChevronUp, ChevronDown, ExternalLink, HelpCircle, Cloud, CloudOff, Package, Archive } from 'lucide-react';
import './App.css';

// Environment configuration
const ENV_CONFIG = {
  defaultWsUrl: process.env.REACT_APP_WS_URL || 'ws://127.0.0.1:9978',
  defaultToken: process.env.REACT_APP_TOKEN || 'supersecret',
  agentDownloadUrl: process.env.REACT_APP_AGENT_DOWNLOAD_URL || 'https://drive.google.com/drive/folders/1vGgfEBHUyD7YLhUw6UtzY4_OSeZnhA9a?usp=sharing',
  enableDebugMode: process.env.REACT_APP_DEBUG === 'true'
};

// Job types
const JOB_TYPES = {
  PRINT: 'print',
  TEST_PRINT: 'test_print',
  CASH_DRAWER: 'cash_drawer',
  BARCODE: 'barcode'
};

// Demo barcode value (fixed for Print Barcode button)
const DEMO_BARCODE = 'INV-20251118';

// Default demo text
const DEMO_TEXT = `
            AARAVPOS STORE
========================================
Invoice: DEMO/00001
========================================
             BARCODE
${DEMO_BARCODE}
========================================
Thank you for using AaravPOS!
`;

const BARCODE_MAX_LEN = 22;
const INVALID_CHAR_REGEX = /[{]/;

// Print Queue class with enhanced functionality
class PrintQueue {
  constructor(onQueueUpdate) {
    this.queue = [];
    this.processing = false;
    this.currentJob = null;
    this.onQueueUpdate = onQueueUpdate;
    this.jobHistory = [];
    this.maxHistory = 20;
    this.isStopped = false;
  }

  add(job, type, data = {}) {
    const jobId = Date.now() + Math.random().toString(36).substr(2, 9);
    const queueJob = {
      id: jobId,
      job,
      type,
      data,
      status: 'queued',
      timestamp: new Date(),
      priority: type === JOB_TYPES.CASH_DRAWER ? 1 : 2
    };

    this.queue.push(queueJob);
    this.queue.sort((a, b) => a.priority - b.priority);
    this.notifyUpdate();

    // Only start processing if not stopped
    if (!this.isStopped) {
      this.process();
    }

    return queueJob;
  }

  async process() {
    // Check if queue is stopped before processing
    if (this.isStopped) return;

    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const nextJob = this.queue.shift();
    this.currentJob = nextJob;
    this.currentJob.status = 'processing';
    this.notifyUpdate();

    try {
      await nextJob.job();
      this.currentJob.status = 'completed';
      this.currentJob.completedAt = new Date();
      this.jobHistory.unshift({ ...this.currentJob });
    } catch (error) {
      this.currentJob.status = 'failed';
      this.currentJob.error = error.message;
      this.jobHistory.unshift({ ...this.currentJob });
    } finally {
      this.currentJob = null;
      this.processing = false;

      if (!this.isStopped) {
        setTimeout(() => this.process(), 300);
      }
    }

    this.notifyUpdate();
  }

  clear() {
    const clearedJobs = this.queue.length;

    // mark jobs as cancelled
    this.queue.forEach(job => {
      job.status = 'cancelled';
      this.jobHistory.unshift({ ...job });
    });

    this.queue = [];
    this.notifyUpdate();
    return clearedJobs;
  }

  cancelJob(jobId) {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      const cancelledJob = this.queue.splice(index, 1)[0];
      cancelledJob.status = 'cancelled';
      this.jobHistory.unshift({ ...cancelledJob });
      this.notifyUpdate();
      return true;
    }
    return false;
  }

  cancelCurrent() {
    if (!this.currentJob) return false;

    this.currentJob.status = 'cancelled';
    this.jobHistory.unshift({ ...this.currentJob });

    this.currentJob = null;
    this.processing = false;

    this.notifyUpdate();

    if (!this.isStopped) {
      setTimeout(() => this.process(), 0);
    }

    return true;
  }

  stop() {
    this.isStopped = true;
    this.notifyUpdate();
  }

  resume() {
    if (!this.isStopped) return;
    this.isStopped = false;
    // Only start processing if there are queued jobs and not currently processing
    if (this.queue.length > 0 && !this.processing) {
      this.process();
    }
    this.notifyUpdate();
  }

  getStatus() {
    return {
      queueSize: this.queue.length,
      queue: Array.isArray(this.queue) ? [...this.queue] : [],
      isProcessing: this.processing,
      currentJob: this.currentJob,
      recentHistory: Array.isArray(this.jobHistory) ? this.jobHistory.slice(0, 5) : []
    };
  }

  notifyUpdate() {
    if (this.onQueueUpdate) {
      this.onQueueUpdate(this.getStatus());
    }
  }
}

function App() {
  // Enhanced environment detection
  const isLocalhost = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '';

  const isProduction = process.env.NODE_ENV === 'production';
  const deployUrl = window.location.origin;

  const [barcodeError, setBarcodeError] = useState('');

  // State - NO AUTO-CONNECT INITIALIZATION
  const [agentDetected, setAgentDetected] = useState(false);
  const [connectionMode, setConnectionMode] = useState('manual');
  const [serverUrl, setServerUrl] = useState(ENV_CONFIG.defaultWsUrl);
  const [customAgentUrl, setCustomAgentUrl] = useState('');
  const [token, setToken] = useState(ENV_CONFIG.defaultToken);
  const [isConnected, setIsConnected] = useState(false);
  const [healthInfo, setHealthInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [textToPrint, setTextToPrint] = useState(`            AARAVPOS STORE
========================================
Invoice:      8F0A8-BE4/2025-26/00002
Date:         ${new Date().toLocaleDateString()}
Time:         ${new Date().toLocaleTimeString()}
Order ID:     979ddc0c-c784-4016-978
Status:       PAID
Currency:     USD
Receipt No:   8F0A8-BE4/2025-26/00002
========================================
               ITEMS
----------------------------------------
Adult Haircut(18+)           x1   30.00
Standard cut                 x1   50.00
----------------------------------------
Subtotal:                        80.00
Discount:                         0.00
Tax:                           500.00
Tip:                             0.00
TOTAL:                         580.00
========================================
         PAYMENT BREAKDOWN
----------------------------------------
Paid:                        580.00
Due:                           0.00
----------------------------------------
             PAYMENTS
----------------------------------------
CASH via LOCAL - SUCCEEDED    580.00
----------------------------------------
             BARCODE
${DEMO_BARCODE}
----------------------------------------
Final Invoice ID: ed1d7c84-2595-xxxx
Series:          8F0A8-BE4
Issued (UTC):    2025-11-18 03:50:01
========================================
    Thank you for visiting AaravPOS!`);
  const [isPrinting, setIsPrinting] = useState(false);
  const [queueStatus, setQueueStatus] = useState({
    queueSize: 0,
    queue: [],
    isProcessing: false,
    currentJob: null,
    recentHistory: []
  });
  const [lastResponse, setLastResponse] = useState(null);
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [requestId, setRequestId] = useState(1);
  const [showAgentInstructions, setShowAgentInstructions] = useState(false);
  const [printDelay, setPrintDelay] = useState(1000);
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [agentStatus, setAgentStatus] = useState({
    installed: false,
    version: null,
    platform: null
  });
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const ws = useRef(null);
  const printQueue = useRef(null);
  const lastPrintTimeRef = useRef(0);

  // Barcode validation function
  const validateBarcode = useCallback((barcode) => {
    if (barcode.includes('{')) {
      return {
        isValid: false,
        message: "Invalid character '{' in barcode",
        tooltip: "Barcode contains invalid character '{'. Please remove it."
      };
    }
    
    if (barcode.length > BARCODE_MAX_LEN) {
      return {
        isValid: false,
        message: `Barcode exceeds ${BARCODE_MAX_LEN} characters`,
        tooltip: `Barcode is ${barcode.length} characters. Maximum allowed is ${BARCODE_MAX_LEN}.`
      };
    }
    
    return { isValid: true, message: '', tooltip: '' };
  }, []);

  // Safe allJobs calculation with array checks
  const allJobs = [
    // Current job (if exists)
    ...(queueStatus.currentJob ? [{
      ...queueStatus.currentJob,
      __kind: 'current',
      displayLabel: queueStatus.currentJob.data?.type || 'Print Job'
    }] : []),

    // Queued jobs (pending) - with safe array check
    ...(Array.isArray(queueStatus.queue) ? queueStatus.queue.map(job => ({
      ...job,
      __kind: 'queued',
      displayLabel: job.data?.type || 'Queued Job'
    })) : []),

    // Recent history (completed/failed/cancelled) - with safe array check
    ...(Array.isArray(queueStatus.recentHistory) ? queueStatus.recentHistory.map(job => ({
      ...job,
      __kind: 'history',
      displayLabel: job.data?.type || 'History Job'
    })) : [])
  ];

  // Initialize print queue
  useEffect(() => {
    printQueue.current = new PrintQueue((status) => {
      setQueueStatus(status);
      setIsPrinting(status.isProcessing);
    });

    return () => {
      if (printQueue.current) {
        printQueue.current.clear();
      }
    };
  }, []);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [
      { id: Date.now(), message, type, timestamp },
      ...prev.slice(0, 49)
    ]);
  }, []);

  // Barcode extraction function (REQUIRED)
  const extractBarcodeFromText = useCallback((text) => {
    const lines = text.split('\n').map(l => l.trim());
    const barcodeIndex = lines.findIndex(line => line === 'BARCODE');

    if (barcodeIndex !== -1 && lines[barcodeIndex + 1]) {
      return lines[barcodeIndex + 1].trim();
    }

    return DEMO_BARCODE; // Fallback to demo barcode
  }, []);

  // Get barcode validation for current text - NOW DEFINED AFTER textToPrint
  const getBarcodeValidation = useCallback(() => {
    const barcode = extractBarcodeFromText(textToPrint);
    return validateBarcode(barcode);
  }, [textToPrint, extractBarcodeFromText, validateBarcode]);

  // Get barcode character count
  const getBarcodeCharacterCount = useCallback(() => {
    const barcode = extractBarcodeFromText(textToPrint);
    return {
      count: barcode.length,
      isValid: barcode.length <= BARCODE_MAX_LEN && !barcode.includes('{')
    };
  }, [textToPrint, extractBarcodeFromText]);

  // Log environment info in debug mode
  useEffect(() => {
    if (ENV_CONFIG.enableDebugMode) {
      console.log('Environment:', {
        isLocalhost,
        isProduction,
        deployUrl,
        nodeEnv: process.env.NODE_ENV
      });
    }

    const barcode = extractBarcodeFromText(textToPrint);
    const validation = validateBarcode(barcode);
    
    if (!validation.isValid) {
      setBarcodeError(validation.message);
    } else {
      setBarcodeError('');
    }
  }, [isLocalhost, isProduction, deployUrl, textToPrint, extractBarcodeFromText, validateBarcode]);

  const stopJobs = useCallback(() => {
    if (printQueue.current) {
      printQueue.current.stop();
      addLog('Job processing stopped', 'warning');
    }
  }, [addLog]);

  const resumeJobs = useCallback(() => {
    if (printQueue.current) {
      printQueue.current.resume();
      addLog('Queue processing resumed', 'success');
    }
  }, [addLog]);

  // Manual agent detection function
  const manualDetectAgent = useCallback(async () => {
    addLog('Manually detecting AaravPOS Agent...', 'info');

    // Try WebSocket connection directly
    const testUrl = customAgentUrl || serverUrl;
    addLog(`Testing connection to: ${testUrl}`, 'info');

    return new Promise((resolve, reject) => {
      const testWs = new WebSocket(`${testUrl}?token=${token}`);
      let timeoutId;

      testWs.onopen = () => {
        clearTimeout(timeoutId);
        testWs.close();
        setAgentDetected(true);
        setAgentStatus(prev => ({
          ...prev,
          installed: true,
          detectedVia: 'manual'
        }));
        addLog(`Agent detected at ${testUrl}`, 'success');
        resolve(testUrl);
      };

      testWs.onerror = () => {
        clearTimeout(timeoutId);
        testWs.close();
        setAgentDetected(false);
        setAgentStatus(prev => ({ ...prev, installed: false }));
        addLog(`No agent found at ${testUrl}`, 'error');
        reject(new Error('Agent not found'));
      };

      // Timeout after 3 seconds
      timeoutId = setTimeout(() => {
        testWs.close();
        setAgentDetected(false);
        addLog('Agent detection timeout', 'warning');
        reject(new Error('Timeout'));
      }, 3000);
    });
  }, [customAgentUrl, serverUrl, token, addLog]);

  // Clean WebSocket connection function
  const connectWebSocket = useCallback((url = null) => {
    // Close existing connection
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.close();
      addLog('Closed existing connection', 'info');
    }

    // Determine which URL to use
    let targetUrl;
    if (url) {
      targetUrl = url;
    } else if (customAgentUrl) {
      targetUrl = customAgentUrl;
    } else {
      targetUrl = serverUrl;
    }

    // Add token to URL
    const fullUrl = `${targetUrl}?token=${token}`;

    addLog(`Connecting to: ${targetUrl}`, 'info');
    setConnectionStatus('connecting');

    try {
      ws.current = new WebSocket(fullUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        addLog('Connected to WebSocket server', 'success');

        // Send initial health check
        setTimeout(() => sendHealthCheck(), 100);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          addLog('Error parsing message', 'error');
        }
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');

        if (event.code === 1006) {
          addLog('Connection failed - Check if agent is running', 'error');
        } else {
          addLog('Disconnected from WebSocket server', 'warning');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        setConnectionStatus('error');
        addLog('WebSocket connection error', 'error');
      };
    } catch (error) {
      setIsConnected(false);
      setConnectionStatus('error');
      addLog(`Connection error: ${error.message}`, 'error');
    }
  }, [token, customAgentUrl, serverUrl, addLog]);

  // Disconnect WebSocket function
  const disconnectWebSocket = useCallback(() => {
    if (ws.current) {
      if (ws.current.readyState === WebSocket.OPEN) {
        ws.current.close(1000, 'User requested disconnect');
        addLog('User disconnected from WebSocket', 'info');
      }
      ws.current = null;
    }
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setHealthInfo(null);
    setPrinters([]);
    setSelectedPrinter('');
  }, [addLog]);

  // Demo mode connection
  const connectDemoMode = useCallback(() => {
    disconnectWebSocket(); // Ensure any existing connection is closed

    addLog('Starting demo mode (simulated printing)', 'info');
    setConnectionMode('demo');
    setConnectionStatus('demo');

    setTimeout(() => {
      setIsConnected(true);
      addLog('Demo mode connected', 'success');

      // Simulate health response
      setTimeout(() => {
        handleWebSocketMessage({
          type: 'health_response',
          payload: {
            ok: true,
            platform: 'demo',
            printers: [{ name: 'Demo Printer', isDefault: true, status: 'READY', isConnected: true }],
            totalPrinters: 1,
            defaultPrinter: 'Demo Printer'
          }
        });
      }, 300);
    }, 500);
  }, [disconnectWebSocket, addLog]);

  const sendMessage = useCallback((message) => {
    if (connectionMode === 'demo') {
      // Handle demo mode messages locally
      handleDemoMessage(message);
      return true;
    }

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    }

    addLog('Not connected to WebSocket server', 'error');
    return false;
  }, [connectionMode]);

  const handleDemoMessage = useCallback((message) => {
    // Simulate responses for demo mode
    const reqId = message.requestId || 'demo-1';

    switch (message.type) {
      case 'health':
        setTimeout(() => {
          handleWebSocketMessage({
            type: 'health_response',
            requestId: reqId,
            payload: {
              ok: true,
              platform: 'demo',
              printers: [
                { name: 'Demo Thermal Printer', isDefault: true, status: 'READY', isConnected: true },
                { name: 'Demo Receipt Printer', isDefault: false, status: 'READY', isConnected: true }
              ],
              totalPrinters: 2,
              defaultPrinter: 'Demo Thermal Printer'
            }
          });
        }, 300);
        break;

      case 'print_text':
        setTimeout(() => {
          handleWebSocketMessage({
            type: 'print_response',
            requestId: reqId,
            payload: {
              success: true,
              message: 'Printed to Demo Printer (DEMO MODE)'
            }
          });
          addLog('Print simulated successfully', 'success');
        }, 800);
        break;

      case 'test_print':
        setTimeout(() => {
          handleWebSocketMessage({
            type: 'test_print_response',
            requestId: reqId,
            payload: {
              success: true,
              message: 'Test print completed (DEMO MODE)'
            }
          });
          addLog('Test print simulated', 'success');
        }, 600);
        break;

      case 'open_cash_drawer':
        setTimeout(() => {
          handleWebSocketMessage({
            type: 'cash_drawer_response',
            requestId: reqId,
            payload: {
              success: true,
              message: 'Cash drawer opened (DEMO MODE)'
            }
          });
          addLog('Cash drawer simulated', 'success');
        }, 500);
        break;

      case 'print_barcode':
        setTimeout(() => {
          handleWebSocketMessage({
            type: 'print_response',
            requestId: reqId,
            payload: {
              success: true,
              message: `Barcode "${message.payload.barcode}" printed (DEMO MODE)`
            }
          });
          addLog(`Barcode "${message.payload.barcode}" simulated`, 'success');
        }, 700);
        break;
    }
  }, [addLog]);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('Received:', data);
    setLastResponse(data);

    switch (data.type) {
      case 'connected':
        setIsConnected(true);
        setConnectionStatus('connected');
        break;

      case 'health_response':
        setHealthInfo(data.payload);
        setPrinters(Array.isArray(data.payload.printers) ? data.payload.printers : []);
        if (data.payload.defaultPrinter && !selectedPrinter) {
          setSelectedPrinter(data.payload.defaultPrinter);
        }
        addLog('Health check completed', 'info');
        break;

      case 'print_response':
        addLog(`Print: ${data.payload.message}`,
          data.payload.success ? 'success' : 'error');
        break;

      case 'test_print_response':
        addLog(`Test print: ${data.payload.message}`,
          data.payload.success ? 'success' : 'error');
        break;

      case 'cash_drawer_response':
        addLog(`Cash drawer: ${data.payload.message}`,
          data.payload.success ? 'success' : 'error');
        break;

      case 'error':
        addLog(`Error: ${data.payload.message}`, 'error');
        break;

      default:
        console.log('Unhandled message type:', data.type);
        addLog(`Received: ${data.type}`, 'info');
        break;
    }
  }, [addLog, selectedPrinter]);

  const sendHealthCheck = useCallback(() => {
    if (connectionMode === 'demo') {
      // Trigger demo health check
      handleDemoMessage({ type: 'health', requestId: 'demo-health' });
      return;
    }

    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      addLog('Not connected to WebSocket server', 'error');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);

    try {
      ws.current.send(JSON.stringify({
        type: 'health',
        requestId: reqId,
        payload: {}
      }));
      addLog('Sending health check...', 'info');
    } catch (error) {
      addLog(`Failed to send health check: ${error.message}`, 'error');
    }
  }, [connectionMode, requestId, addLog, handleDemoMessage]);

  // Print Barcode Button Handler - Prints ONLY barcode with demo value
  const handlePrintBarcode = useCallback(() => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const job = async () => {
      const reqId = requestId.toString();
      setRequestId(prev => prev + 1);

      return new Promise((resolve, reject) => {
        if (sendMessage({
          type: 'print_barcode',
          requestId: reqId,
          payload: {
            printerName: selectedPrinter || 'Demo Printer',
            barcode: DEMO_BARCODE, // Always use demo barcode
            format: 'CODE128'
          }
        })) {
          addLog(`Printing barcode only: ${DEMO_BARCODE}`, 'info');
          resolve();
        } else {
          addLog('Not connected to server', 'error');
          reject(new Error('Not connected'));
        }
      });
    };

    if (printQueue.current) {
      const queueJob = printQueue.current.add(
        job,
        JOB_TYPES.BARCODE,
        { printerName: selectedPrinter || 'Demo Printer', type: 'Print Barcode Only' }
      );
      addLog(`Barcode-only job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  // Print Text Button Handler - Prints receipt text with barcode inserted at BARCODE position
  const handlePrintText = useCallback(() => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    // Validate barcode before proceeding
    const barcode = extractBarcodeFromText(textToPrint);
    const validation = validateBarcode(barcode);
    
    if (!validation.isValid) {
      addLog(`Cannot print: ${validation.message}`, 'error');
      return;
    }

    // Create a single job that combines text and barcode
    const printCombinedJob = async () => {
      const reqId = requestId.toString();
      setRequestId(prev => prev + 1);

      return new Promise((resolve, reject) => {
        if (sendMessage({
          type: 'print_barcode',
          requestId: reqId,
          payload: {
            printerName: selectedPrinter || 'Demo Printer',
            barcode: barcode,
            format: 'CODE128',
            receiptText: textToPrint // Send the entire text for server to parse
          }
        })) {
          addLog(`Printing combined receipt with barcode: ${barcode}`, 'info');
          resolve();
        } else {
          addLog('Not connected to server', 'error');
          reject(new Error('Not connected'));
        }
      });
    };

    if (printQueue.current) {
      const textJob = printQueue.current.add(
        printCombinedJob,
        JOB_TYPES.PRINT,
        {
          printerName: selectedPrinter || 'Demo Printer',
          type: 'Print Combined Receipt',
          hasBarcode: true,
          barcodeValue: barcode
        }
      );
      addLog(`Combined receipt job added to queue (ID: ${textJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, textToPrint, requestId, addLog, sendMessage, extractBarcodeFromText, validateBarcode]);

  const handleTestPrint = useCallback(async () => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const job = async () => {
      const reqId = requestId.toString();
      setRequestId(prev => prev + 1);

      return new Promise((resolve, reject) => {
        if (sendMessage({
          type: 'test_print',
          requestId: reqId,
          payload: {
            printerName: selectedPrinter || 'Demo Printer'
          }
        })) {
          addLog(`Sending test print to ${selectedPrinter || 'Demo Printer'}...`, 'info');
          resolve();
        } else {
          addLog('Not connected to server', 'error');
          reject(new Error('Not connected'));
        }
      });
    };

    if (printQueue.current) {
      const queueJob = printQueue.current.add(
        job,
        JOB_TYPES.TEST_PRINT,
        { printerName: selectedPrinter || 'Demo Printer', type: 'Test Print' }
      );
      addLog(`Test print job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  const handleOpenCashDrawer = useCallback(async () => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const job = async () => {
      const reqId = requestId.toString();
      setRequestId(prev => prev + 1);

      return new Promise((resolve, reject) => {
        if (sendMessage({
          type: 'open_cash_drawer',
          requestId: reqId,
          payload: {
            printerName: selectedPrinter || 'Demo Printer'
          }
        })) {
          addLog(`Opening cash drawer on ${selectedPrinter || 'Demo Printer'}...`, 'info');
          resolve();
        } else {
          addLog('Not connected to server', 'error');
          reject(new Error('Not connected'));
        }
      });
    };

    if (printQueue.current) {
      const queueJob = printQueue.current.add(
        job,
        JOB_TYPES.CASH_DRAWER,
        { printerName: selectedPrinter || 'Demo Printer', type: 'Open Cash Drawer' }
      );
      addLog(`Cash drawer job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  const handleRefreshPrinters = useCallback(() => {
    sendHealthCheck();
  }, [sendHealthCheck]);

  const clearPrintQueue = useCallback(() => {
    if (printQueue.current) {
      const cleared = printQueue.current.clear();
      addLog(`Cleared ${cleared} queued job(s)`, 'info');
    }
  }, [addLog]);

  const cancelQueuedJob = useCallback((jobId) => {
    if (printQueue.current) {
      const cancelled = printQueue.current.cancelJob(jobId);
      if (cancelled) {
        addLog(`Cancelled queued job ${jobId.substring(0, 8)}`, 'warning');
      }
      return cancelled;
    }
    return false;
  }, [addLog]);

  const cancelCurrentJob = useCallback(() => {
    if (printQueue.current) {
      const cancelled = printQueue.current.cancelCurrent();
      if (cancelled) {
        addLog('Current job terminated', 'warning');
      }
    }
  }, [addLog]);

  const generateTestJobs = useCallback(() => {
    if (!printQueue.current) return;

    for (let i = 1; i <= 20; i++) {
      printQueue.current.add(
        async () => {
          return new Promise(resolve => {
            setTimeout(() => {
              addLog(`Test job ${i} executed`, 'info');
              resolve();
            }, 500);
          });
        },
        JOB_TYPES.PRINT,
        { type: 'Bulk Test Job', index: i }
      );
    }

    addLog('Generated 20 test print jobs', 'success');
  }, [addLog]);

  const getLogTypeClass = (type) => {
    switch (type) {
      case 'success': return 'log-success';
      case 'error': return 'log-error';
      case 'warning': return 'log-warning';
      default: return 'log-info';
    }
  };

  const getJobTypeDisplay = (type) => {
    switch (type) {
      case JOB_TYPES.PRINT:
        return { icon: <FileText size={16} />, label: 'Print', color: 'print' };
      case JOB_TYPES.TEST_PRINT:
        return { icon: <FlaskConical size={16} />, label: 'Test Print', color: 'test' };
      case JOB_TYPES.CASH_DRAWER:
        return { icon: <DollarSign size={16} />, label: 'Cash Drawer', color: 'cash' };
      case JOB_TYPES.BARCODE:
        return { icon: <Barcode size={16} />, label: 'Barcode', color: 'barcode' };
      default:
        return { icon: <Printer size={16} />, label: type, color: 'default' };
    }
  };

  const getJobStatusDisplay = (job) => {
    if (job.__kind === 'current') return (
      <span className="job-status-text">
        <RefreshCw size={14} className="spinning" /> Processing
      </span>
    );

    switch (job.status) {
      case 'queued': return (
        <span className="job-status-text">
          <Hourglass size={14} /> Queued
        </span>
      );
      case 'processing': return (
        <span className="job-status-text">
          <Loader2 size={14} className="spinning" /> Processing
        </span>
      );
      case 'completed': return (
        <span className="job-status-text">
          <Check size={14} /> Completed
        </span>
      );
      case 'failed': return (
        <span className="job-status-text">
          <X size={14} /> Failed
        </span>
      );
      case 'cancelled': return (
        <span className="job-status-text">
          <AlertTriangle size={14} /> Cancelled
        </span>
      );
      default: return (
        <span className="job-status-text">{job.status}</span>
      );
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'connected';
      case 'connecting': return 'connecting';
      case 'error': return 'error';
      case 'demo': return 'demo';
      default: return 'disconnected';
    }
  };

  const switchToDemoMode = useCallback(() => {
    disconnectWebSocket();
    connectDemoMode();
  }, [disconnectWebSocket, connectDemoMode]);

  const switchToAgentMode = useCallback(() => {
    setConnectionMode('agent');
    setShowAgentInstructions(false);
    disconnectWebSocket();
  }, [disconnectWebSocket]);

  // Handle agent download
  const downloadAgent = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();

    let downloadUrl = ENV_CONFIG.agentDownloadUrl;
    let detectedOS = 'Unknown';

    if (userAgent.includes('win') || platform.includes('win')) {
      downloadUrl = `${ENV_CONFIG.agentDownloadUrl}/download/AaravPOS-Agent-Windows.exe`;
      detectedOS = 'Windows';
    } else if (userAgent.includes('mac') || platform.includes('mac')) {
      downloadUrl = `${ENV_CONFIG.agentDownloadUrl}/download/AaravPOS-Agent-macOS.dmg`;
      detectedOS = 'macOS';
    } else if (userAgent.includes('linux') || platform.includes('linux')) {
      downloadUrl = `${ENV_CONFIG.agentDownloadUrl}/download/AaravPOS-Agent-Linux.AppImage`;
      detectedOS = 'Linux';
    }

    addLog(`Detected OS: ${detectedOS}. Opening download...`, 'info');
    window.open(downloadUrl, '_blank');
    addLog('Opening agent download page...', 'info');
  };

  // Add environment badge to footer
  const renderEnvironmentInfo = () => (
    <div className="environment-info-badge">
      <span>Environment: {isProduction ? 'Production' : 'Development'}</span>
      {!isLocalhost && <span className="hosted-badge">Hosted at {deployUrl}</span>}
    </div>
  );

  // Auto-refresh effect
  useEffect(() => {
    let interval;
    if (autoRefresh && isConnected) {
      interval = setInterval(() => {
        sendHealthCheck();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, isConnected, sendHealthCheck]);

  // Calculate validation for demo barcode
  const demoBarcodeValidation = validateBarcode(DEMO_BARCODE);

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-title d-flex">
          <Printer size={24} className='mr'/>
          <h1>AaravPOS Print Server Tester</h1>
        </div>
        <div className="environment-badge">
          {isLocalhost ? <Home size={14} /> : <Globe size={14} />}
          {isLocalhost ? ' Local' : ' Hosted'}
        </div>
        <div className="header-controls">
          <div className="mode-selector">
            <button
              className={`mode-btn ${connectionMode === 'agent' ? 'active' : ''}`}
              onClick={switchToAgentMode}
              disabled={connectionMode === 'agent'}
            >
              <span className="mode-indicator agent">
                <Server size={12} />
              </span>
              Manual Agent
            </button>
            <button
              className={`mode-btn ${connectionMode === 'demo' ? 'active' : ''}`}
              onClick={switchToDemoMode}
              disabled={connectionMode === 'demo'}
            >
              <span className="mode-indicator demo">
                <Theater size={12} />
              </span>
              Demo Mode
            </button>
          </div>
          <div className="status-indicator">
            <span className={`status-dot ${getConnectionStatusColor()}`}></span>
            <span>
              {connectionStatus === 'connected' ? (
                <>
                  <Wifi size={14} /> Connected
                </>
              ) : connectionStatus === 'connecting' ? (
                <>
                  <Loader2 size={14} className="spinning" /> Connecting...
                </>
              ) : connectionStatus === 'demo' ? (
                <>
                  <Theater size={14} /> Demo Mode
                </>
              ) : connectionStatus === 'error' ? (
                <>
                  <AlertCircle size={14} /> Connection Error
                </>
              ) : (
                <>
                  <WifiOff size={14} /> Disconnected
                </>
              )}
            </span>
          </div>
        </div>
      </header>

      {/* Agent Instructions Modal - Only shows when manually triggered */}
      {showAgentInstructions && (
        <div className="agent-instructions-modal">
          <div className="instructions-card">
            <div className="instructions-header d-flex">
              <Package size={24} className='mr' />
              <h2>AaravPOS Agent Setup</h2>
            </div>
            <p className="instructions-intro">
              To connect to physical printers and cash drawers, you need to install the AaravPOS Agent on your computer.
            </p>

            <div className="instructions-steps">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4><Download size={18} /> Download & Install</h4>
                  <p>Download the agent for your operating system and install it.</p>
                  <button className="btn btn-primary btn-download" onClick={downloadAgent}>
                    <Download size={18} />
                    Download Agent
                  </button>
                </div>
              </div>

              <div className="step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4><Server size={18} /> Run the Agent</h4>
                  <p>After installation, the agent will run in your system tray (taskbar).</p>
                  <div className="agent-info">
                    <div className="info-item">
                      <span className="info-label">WebSocket:</span>
                      <code>ws://127.0.0.1:9978</code>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Default Token:</span>
                      <code>supersecret</code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4><Settings size={18} /> Manual Connection</h4>
                  <p>Enter connection details below and click "Connect"</p>
                </div>
              </div>
            </div>

            <div className="instructions-actions">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowAgentInstructions(false);
                  switchToDemoMode();
                }}
              >
                <Theater size={18} /> Use Demo Mode
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setShowAgentInstructions(false)}
              >
                Close
              </button>
            </div>

            <button
              className="close-instructions"
              onClick={() => setShowAgentInstructions(false)}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      <div className="main-content">
        <div className="control-panel">
          <div className="card">
            <div className="card-title d-flex">
              <Settings size={20} className='mr'/>
              <h3>Manual Connection Settings</h3>
            </div>

            <div className="connection-status-display">
              <div className={`status-badge ${getConnectionStatusColor()}`}>
                {connectionStatus === 'connected' && <Wifi size={14} />}
                {connectionStatus === 'connecting' && <Loader2 size={14} className="spinning" />}
                {connectionStatus === 'demo' && <Theater size={14} />}
                {connectionStatus === 'error' && <AlertCircle size={14} />}
                {connectionStatus === 'disconnected' && <WifiOff size={14} />}
                {connectionStatus.toUpperCase()}
              </div>
              {connectionMode === 'demo' && (
                <span className="demo-note">(Printing is simulated)</span>
              )}
            </div>

            {connectionMode === 'agent' && (
              <>
                <div className="form-group">
                  <label><Server size={16} /> WebSocket URL</label>
                  <input
                    type="text"
                    value={customAgentUrl || serverUrl}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomAgentUrl(value);
                      setServerUrl(value);
                    }}
                    className="form-control"
                    placeholder="ws://127.0.0.1:9978"
                  />
                  <small className="form-help">
                    Default: <code>ws://127.0.0.1:9978</code>
                  </small>
                </div>
                <div className="form-group">
                  <label><Shield size={16} /> Authentication Token</label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="form-control"
                  />
                  <small className="form-help">
                    Default token: <code>supersecret</code>
                  </small>
                </div>

                <div className="button-group">
                  <button
                    onClick={() => connectWebSocket(customAgentUrl || serverUrl)}
                    className="btn btn-primary"
                    disabled={connectionStatus === 'connecting'}
                  >
                    {connectionStatus === 'connecting' ? (
                      <>
                        <Loader2 size={18} className="spinning" /> Connecting...
                      </>
                    ) : connectionStatus === 'connected' ? (
                      <>
                        <RefreshCw size={18} /> Reconnect
                      </>
                    ) : (
                      <>
                        <Wifi size={18} /> Connect
                      </>
                    )}
                  </button>
                  <button
                    onClick={disconnectWebSocket}
                    className="btn btn-danger"
                    disabled={connectionStatus === 'disconnected' || connectionStatus === 'demo'}
                  >
                    <WifiOff size={18} /> Disconnect
                  </button>
                  <button
                    onClick={manualDetectAgent}
                    className="btn btn-secondary"
                    disabled={connectionStatus === 'connecting'}
                  >
                    <Search size={18} /> Detect Agent
                  </button>
                  <button
                    onClick={sendHealthCheck}
                    className="btn btn-secondary"
                    disabled={!isConnected && connectionMode !== 'demo'}
                  >
                    <ClipboardCheck size={18} /> Health Check
                  </button>
                </div>

                <div className="agent-actions">
                  <button
                    onClick={() => setShowAgentInstructions(true)}
                    className="btn-link"
                  >
                    <Package size={16} /> Need Agent Setup?
                  </button>
                </div>
              </>
            )}

            {connectionMode === 'demo' && (
              <div className="demo-connection-info">
                <p><Theater size={18} /> Demo mode is active. All print actions are simulated.</p>
                <div className="button-group">
                  <button
                    onClick={sendHealthCheck}
                    className="btn btn-secondary"
                  >
                    <ClipboardCheck size={18} /> Demo Health Check
                  </button>
                  <button
                    onClick={switchToAgentMode}
                    className="btn btn-primary"
                  >
                    <Server size={18} /> Switch to Agent Mode
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title d-flex">
                <Printer size={20} className='mr' />
                <h3>Printers</h3>
              </div>
              <button
                onClick={handleRefreshPrinters}
                className="btn-icon"
                title="Refresh printers"
                disabled={!isConnected && connectionMode !== 'demo'}
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {connectionMode === 'demo' ? (
              <div className="demo-printer-info">
                <div className="demo-printer-list">
                  <div className="printer-item demo">
                    <span className="printer-name"><Printer size={16} /> Demo Thermal Printer</span>
                    <span className="printer-status ready">READY</span>
                  </div>
                  <div className="printer-item demo">
                    <span className="printer-name"><Printer size={16} /> Demo Receipt Printer</span>
                    <span className="printer-status ready">READY</span>
                  </div>
                </div>
                <p className="demo-note">Printing is simulated. Install agent for physical printers.</p>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Select Printer</label>
                  <select
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    className="form-control"
                    disabled={!isConnected || printers.length === 0}
                  >
                    <option value="">-- Select a printer --</option>
                    {Array.isArray(printers) && printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name} {printer.isDefault ? '(Default)' : ''} - {printer.status}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedPrinter && (
                  <div className="selected-printer">
                    <Printer size={16} />
                    Selected: <strong>{selectedPrinter}</strong>
                  </div>
                )}
                {printers.length === 0 && isConnected && (
                  <div className="no-printers">
                    <AlertTriangle size={16} />
                    <p>No printers found. Make sure printers are connected and drivers are installed.</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="queue-header">
              <div className="card-title d-flex">
                <Archive size={20} className='mr' />
                <h3>Printer Actions</h3>
              </div>
            </div>

            <div className="action-buttons">
              {/* Print Text Button (prints text + barcode derived from text) */}
              <button
                onClick={handlePrintText}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected || !getBarcodeValidation().isValid}
                className="btn btn-action btn-print"
                title={!getBarcodeValidation().isValid ? getBarcodeValidation().tooltip : "Print text with embedded barcode"}
              >
                <FileText size={18} /> Print Text
              </button>

              {/* Print Barcode Button (prints ONLY demo barcode) */}
              <button
                onClick={handlePrintBarcode}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected || !demoBarcodeValidation.isValid}
                className="btn btn-action btn-barcode"
                title={!demoBarcodeValidation.isValid ? demoBarcodeValidation.tooltip : "Print only the demo barcode"}
              >
                <Barcode size={18} /> Print Barcode
              </button>

              <button
                onClick={handleTestPrint}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected}
                className="btn btn-action btn-test"
              >
                <FlaskConical size={18} /> Test Print
              </button>
              <button
                onClick={handleOpenCashDrawer}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected}
                className="btn btn-action btn-cash"
              >
                <DollarSign size={18} /> Open Drawer
              </button>
            </div>

            {showQueueDetails && (
              <div className="queue-details">
                <h4>Queue Details</h4>
                {queueStatus.queueSize > 0 ? (
                  <div className="pending-jobs">
                    <p className="queue-subtitle">Pending Jobs: {queueStatus.queueSize}</p>
                    {queueStatus.currentJob && (
                      <div className="job-item job-current">
                        <span className="job-type">{getJobTypeDisplay(queueStatus.currentJob.type).label}</span>
                        <span className="job-status processing">Processing</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="queue-empty">No pending jobs</p>
                )}
              </div>
            )}

            <div className="auto-refresh">
              <label>
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  disabled={!isConnected}
                />
                <RefreshCw size={16} /> Auto-refresh health info (every 5s)
              </label>
            </div>
          </div>

          {connectionMode === 'demo' && (
            <div className="card demo-notice">
              <div className="card-title">
                <Theater size={20} />
                <h3>Demo Mode Active</h3>
              </div>
              <p>All print actions are simulated. Perfect for testing without a printer.</p>
              <div className="demo-features">
                <div className="feature">
                  <Check size={16} className="feature-icon" />
                  <span>Simulated printing</span>
                </div>
                <div className="feature">
                  <Check size={16} className="feature-icon" />
                  <span>Test receipt generation</span>
                </div>
                <div className="feature">
                  <Check size={16} className="feature-icon" />
                  <span>Queue management</span>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={switchToAgentMode}
              >
                <Server size={18} /> Switch to Manual Agent Mode
              </button>
            </div>
          )}
        </div>

        <div className="text-panel">
          <div className="card">
            <div className="card-title d-flex">
              <FileText size={20} className='mr' />
              <h3>Text to Print</h3>
            </div>
            <div className="text-info">
              <p><Info size={16} /> <strong>Note:</strong> Changing text will update the barcode printed with "Print Text" button</p>
              <p><Barcode size={16} /> <strong>Demo Barcode (fixed):</strong> {DEMO_BARCODE}</p>
              {!demoBarcodeValidation.isValid && (
                <div className="barcode-error-box demo-error">
                  <AlertTriangle size={14} /> {demoBarcodeValidation.message}
                </div>
              )}
            </div>
            <textarea
              value={textToPrint}
              onChange={(e) => setTextToPrint(e.target.value)}
              className="text-editor"
              spellCheck="false"
              placeholder="Enter text to print..."
            />
            <div className="text-stats">
              <span>Characters: {textToPrint.length}</span>
              <span>Lines: {textToPrint.split('\n').length}</span>
              {connectionMode === 'demo' && <span className="demo-badge">DEMO</span>}
            </div>
            
            {barcodeError && (
              <div className="barcode-error-box">
                <AlertTriangle size={14} /> {barcodeError}
              </div>
            )}
            
            <div className={`barcode-counter ${getBarcodeCharacterCount().isValid ? '' : getBarcodeCharacterCount().count > BARCODE_MAX_LEN ? 'error' : 'warning'}`}>
              Barcode: {getBarcodeCharacterCount().count}/{BARCODE_MAX_LEN} characters
            </div>
            
            <div className="text-actions">
              <button
                className="btn btn-sm"
                onClick={() => {
                  const extractedBarcode = extractBarcodeFromText(textToPrint);
                  setTextToPrint(`            AARAVPOS STORE
========================================
Invoice:      ${Date.now().toString(36).toUpperCase()}
Date:         ${new Date().toLocaleDateString()}
Time:         ${new Date().toLocaleTimeString()}
========================================
Item 1                     x1   25.00
Item 2                     x2   15.00
========================================
BARCODE
${extractedBarcode || DEMO_BARCODE}
========================================
TOTAL:                        55.00
========================================
Thank you for your business!`);
                }}
              >
                Load Sample Receipt
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setTextToPrint('')}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="status-panel">
          <div className="card">
            <div className="card-title d-flex">
              <Cpu size={20} className='mr' />
              <h3>System Status</h3>
            </div>
            <div className="environment-status">
              <div className="status-item">
                <span className="status-label">Environment:</span>
                <span className={`status-value ${isLocalhost ? 'local' : 'hosted'}`}>
                  {isLocalhost ? <Home size={14} /> : <Globe size={14} />}
                  {isLocalhost ? ' Local' : ' Hosted'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Connection Mode:</span>
                <span className={`status-value ${connectionMode}`}>
                  {connectionMode === 'demo' ? <Theater size={14} /> : <Server size={14} />}
                  {connectionMode === 'demo' ? ' Demo' : ' Manual Agent'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Agent Detected:</span>
                <span className={`status-value ${agentDetected ? 'detected' : 'not-detected'}`}>
                  {agentDetected ? <Check size={14} /> : <X size={14} />}
                  {agentDetected ? ' Yes' : ' No'}
                </span>
              </div>
            </div>

            {healthInfo ? (
              <div className="status-info">
                <div className="status-row">
                  <span>Server Status:</span>
                  <span className={`status-badge ${healthInfo.ok ? 'healthy' : 'error'}`}>
                    {healthInfo.ok ? <Check size={14} /> : <X size={14} />}
                    {healthInfo.ok ? 'Healthy' : 'Error'}
                  </span>
                </div>
                <div className="status-row">
                  <span>Platform:</span>
                  <span>{healthInfo.platform}</span>
                </div>
                <div className="status-row">
                  <span>Printers Found:</span>
                  <span className="printer-count">
                    <Printer size={14} /> {healthInfo.totalPrinters}
                  </span>
                </div>
                {connectionMode !== 'demo' && healthInfo.defaultPrinter && (
                  <div className="status-row">
                    <span>Default Printer:</span>
                    <span>{healthInfo.defaultPrinter}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-status">
                {connectionMode === 'demo'
                  ? 'Demo mode active - simulated printing available'
                  : 'Connect to see server status'}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title d-flex">
              <Bell size={20} className='mr' />
              <h3>Activity Log</h3>
            </div>
            <div className="log-container">
              {logs.length > 0 ? (
                <ul className="log-list">
                  {logs.map((log) => (
                    <li key={log.id} className={getLogTypeClass(log.type)}>
                      <span className="log-time">[{log.timestamp}]</span>
                      <span className="log-message">
                        {log.type === 'success' && <Check size={14} />}
                        {log.type === 'error' && <X size={14} />}
                        {log.type === 'warning' && <AlertTriangle size={14} />}
                        {log.type === 'info' && <Info size={14} />}
                        {log.message}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="no-logs">
                  <Info size={16} /> No activity yet
                </div>
              )}
            </div>
            <div className="log-actions">
              <button
                className="btn btn-sm"
                onClick={() => setLogs([])}
              >
                Clear Logs
              </button>
            </div>
          </div>

          {lastResponse && (
            <div className="card">
              <div className="card-title d-flex">
                <FileText size={20} className='mr' />
                <h3>Last Response</h3>
              </div>
              <pre className="response-preview">
                {JSON.stringify(lastResponse, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      <footer className="app-footer">
        <div className="footer-content">
          <p>
            <Printer size={16} /> AaravPOS Print Tester •
            <span className={`env-indicator ${isLocalhost ? 'local' : 'hosted'}`}>
              {isLocalhost ? <Home size={14} /> : <Globe size={14} />}
              {isLocalhost ? ' Local Mode' : ' Hosted Mode'}
            </span>
            • Connection: <span className={`connection-indicator ${getConnectionStatusColor()}`}>
              {connectionStatus === 'connected' && <Wifi size={14} />}
              {connectionStatus === 'disconnected' && <WifiOff size={14} />}
              {connectionStatus === 'demo' && <Theater size={14} />}
              {connectionStatus.toUpperCase()}
            </span>
            {queueStatus.queueSize > 0 && ` • Queue: ${queueStatus.queueSize} jobs`}
            {queueStatus.isProcessing && ` • Printing...`}
          </p>
          <p className="footer-note">
            {connectionMode === 'agent' && !isConnected && (
              <button
                className="btn-link"
                onClick={() => setShowAgentInstructions(true)}
              >
                <Package size={16} /> Need help setting up the agent?
              </button>
            )}
            {connectionMode === 'demo' && (
              <span><Theater size={16} /> Running in demo mode. Switch to agent mode for physical printing.</span>
            )}
          </p>
          {renderEnvironmentInfo()}
        </div>
      </footer>
    </div>
  );
}

export default App;