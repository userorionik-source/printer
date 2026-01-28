// App.js - Manual Connection Version (No Auto-connect)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StopCircle, XCircle, Loader2, Printer, Play, RefreshCw } from 'lucide-react';
import QueueManagementPanel from './QueueManagementPanel';
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
  }, [isLocalhost, isProduction, deployUrl]);

  // State - NO AUTO-CONNECT INITIALIZATION
  const [agentDetected, setAgentDetected] = useState(false);
  const [connectionMode, setConnectionMode] = useState('manual'); // Changed from 'auto' to 'manual'
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
INV-20251118-035012-7AB50493
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

  const stopJobs = useCallback(() => {
    if (printQueue.current) {
      printQueue.current.stop();
      addLog('⏹️ Job processing stopped', 'warning');
    }
  }, [addLog]);

  const resumeJobs = useCallback(() => {
    if (printQueue.current) {
      printQueue.current.resume();
      addLog('▶️ Queue processing resumed', 'success');
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
        addLog(`✅ Agent detected at ${testUrl}`, 'success');
        resolve(testUrl);
      };

      testWs.onerror = () => {
        clearTimeout(timeoutId);
        testWs.close();
        setAgentDetected(false);
        setAgentStatus(prev => ({ ...prev, installed: false }));
        addLog(`❌ No agent found at ${testUrl}`, 'error');
        reject(new Error('Agent not found'));
      };

      // Timeout after 3 seconds
      timeoutId = setTimeout(() => {
        testWs.close();
        setAgentDetected(false);
        addLog('⏱️ Agent detection timeout', 'warning');
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

    addLog(`🔄 Connecting to: ${targetUrl}`, 'info');
    setConnectionStatus('connecting');

    try {
      ws.current = new WebSocket(fullUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        addLog('✅ Connected to WebSocket server', 'success');

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
          addLog('❌ Connection failed - Check if agent is running', 'error');
        } else {
          addLog('⚠️ Disconnected from WebSocket server', 'warning');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
        setConnectionStatus('error');
        addLog('❌ WebSocket connection error', 'error');
      };
    } catch (error) {
      setIsConnected(false);
      setConnectionStatus('error');
      addLog(`❌ Connection error: ${error.message}`, 'error');
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

    addLog('🎭 Starting demo mode (simulated printing)', 'info');
    setConnectionMode('demo');
    setConnectionStatus('demo');

    setTimeout(() => {
      setIsConnected(true);
      addLog('✅ Demo mode connected', 'success');

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
        addLog('✅ Health check completed', 'info');
        break;

      case 'print_response':
        addLog(`📄 Print: ${data.payload.message}`,
          data.payload.success ? 'success' : 'error');
        break;

      case 'test_print_response':
        addLog(`🧪 Test print: ${data.payload.message}`,
          data.payload.success ? 'success' : 'error');
        break;

      case 'cash_drawer_response':
        addLog(`💰 Cash drawer: ${data.payload.message}`,
          data.payload.success ? 'success' : 'error');
        break;

      case 'error':
        addLog(`❌ Error: ${data.payload.message}`, 'error');
        break;

      default:
        console.log('Unhandled message type:', data.type);
        addLog(`ℹ️ Received: ${data.type}`, 'info');
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
      addLog('❌ Not connected to WebSocket server', 'error');
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
      addLog('🔄 Sending health check...', 'info');
    } catch (error) {
      addLog(`❌ Failed to send health check: ${error.message}`, 'error');
    }
  }, [connectionMode, requestId, addLog, handleDemoMessage]);

  const handlePrintText = useCallback(async () => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('⚠️ Please select a printer first', 'warning');
      return;
    }

    const job = async () => {
      const reqId = requestId.toString();
      setRequestId(prev => prev + 1);

      return new Promise((resolve, reject) => {
        if (sendMessage({
          type: 'print_text',
          requestId: reqId,
          payload: {
            printerName: selectedPrinter || 'Demo Printer',
            text: textToPrint
          }
        })) {
          addLog(`🖨️ Printing to ${selectedPrinter || 'Demo Printer'}...`, 'info');
          resolve();
        } else {
          addLog('❌ Not connected to server', 'error');
          reject(new Error('Not connected'));
        }
      });
    };

    if (printQueue.current) {
      const queueJob = printQueue.current.add(
        job,
        JOB_TYPES.PRINT,
        { printerName: selectedPrinter || 'Demo Printer', type: 'Print Text' }
      );
      addLog(`📝 Print job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage, textToPrint]);

  const handleTestPrint = useCallback(async () => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('⚠️ Please select a printer first', 'warning');
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
          addLog(`🧪 Sending test print to ${selectedPrinter || 'Demo Printer'}...`, 'info');
          resolve();
        } else {
          addLog('❌ Not connected to server', 'error');
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
      addLog(`📝 Test print job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  const handleOpenCashDrawer = useCallback(async () => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('⚠️ Please select a printer first', 'warning');
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
          addLog(`💰 Opening cash drawer on ${selectedPrinter || 'Demo Printer'}...`, 'info');
          resolve();
        } else {
          addLog('❌ Not connected to server', 'error');
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
      addLog(`📝 Cash drawer job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  const handlePrintBarcode = useCallback(async (barcodeValue) => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('⚠️ Please select a printer first', 'warning');
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
            receiptText: textToPrint, // Include the receipt text
            barcode: barcodeValue,
            format: 'CODE128'
          }
        })) {
          addLog(`🏷️ Printing barcode: ${barcodeValue} with receipt`, 'info');
          resolve();
        } else {
          reject(new Error('WebSocket not connected'));
        }
      });
    };

    if (printQueue.current) {
      const queueJob = printQueue.current.add(
        job,
        JOB_TYPES.BARCODE,
        {
          printerName: selectedPrinter || 'Demo Printer',
          barcode: barcodeValue,
          type: 'Print Barcode'
        }
      );
      addLog(`📝 Barcode job queued (${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [
    selectedPrinter,
    connectionMode,
    requestId,
    sendMessage,
    addLog,
    textToPrint  // Add textToPrint as dependency
  ]);

  const handleRefreshPrinters = useCallback(() => {
    sendHealthCheck();
  }, [sendHealthCheck]);

  const clearPrintQueue = useCallback(() => {
    if (printQueue.current) {
      const cleared = printQueue.current.clear();
      addLog(`🧹 Cleared ${cleared} queued job(s)`, 'info');
    }
  }, [addLog]);

  const cancelQueuedJob = useCallback((jobId) => {
    if (printQueue.current) {
      const cancelled = printQueue.current.cancelJob(jobId);
      if (cancelled) {
        addLog(`❌ Cancelled queued job ${jobId.substring(0, 8)}`, 'warning');
      }
      return cancelled;
    }
    return false;
  }, [addLog]);

  const cancelCurrentJob = useCallback(() => {
    if (printQueue.current) {
      const cancelled = printQueue.current.cancelCurrent();
      if (cancelled) {
        addLog('❌ Current job terminated', 'warning');
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
              addLog(`🧪 Test job ${i} executed`, 'info');
              resolve();
            }, 500);
          });
        },
        JOB_TYPES.PRINT,
        { type: 'Bulk Test Job', index: i }
      );
    }

    addLog('🚀 Generated 20 test print jobs', 'success');
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
        return { icon: '📄', label: 'Print', color: 'print' };
      case JOB_TYPES.TEST_PRINT:
        return { icon: '🧪', label: 'Test Print', color: 'test' };
      case JOB_TYPES.CASH_DRAWER:
        return { icon: '💰', label: 'Cash Drawer', color: 'cash' };
      default:
        return { icon: '🖨️', label: type, color: 'default' };
    }
  };

  const getJobStatusDisplay = (job) => {
    if (job.__kind === 'current') return '🔄 Processing';

    switch (job.status) {
      case 'queued': return '⏳ Queued';
      case 'processing': return '🔄 Processing';
      case 'completed': return '✅ Completed';
      case 'failed': return '❌ Failed';
      case 'cancelled': return '⚠️ Cancelled';
      default: return job.status;
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

    addLog(`💻 Detected OS: ${detectedOS}. Opening download...`, 'info');
    window.open(downloadUrl, '_blank');
    addLog('📥 Opening agent download page...', 'info');
  };

  // Add environment badge to footer
  const renderEnvironmentInfo = () => (
    <div className="environment-info-badge">
      <span>Environment: {isProduction ? '🌐 Production' : '🔧 Development'}</span>
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

  // REMOVED ALL AUTO-CONNECT EFFECTS
  // User must manually connect

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>AaravPOS Print Server Tester</h1>
        <div className="environment-badge">
          {isLocalhost ? '🏠 Local' : '🌐 Hosted'}
        </div>
        <div className="header-controls">
          <div className="mode-selector">
            <button
              className={`mode-btn ${connectionMode === 'agent' ? 'active' : ''}`}
              onClick={switchToAgentMode}
              disabled={connectionMode === 'agent'}
            >
              <span className="mode-indicator agent"></span>
              Manual Agent
            </button>
            <button
              className={`mode-btn ${connectionMode === 'demo' ? 'active' : ''}`}
              onClick={switchToDemoMode}
              disabled={connectionMode === 'demo'}
            >
              <span className="mode-indicator demo"></span>
              Demo Mode
            </button>
          </div>
          <div className="status-indicator">
            <span className={`status-dot ${getConnectionStatusColor()}`}></span>
            <span>
              {connectionStatus === 'connected' ? 'Connected' :
                connectionStatus === 'connecting' ? 'Connecting...' :
                  connectionStatus === 'demo' ? 'Demo Mode' :
                    connectionStatus === 'error' ? 'Connection Error' :
                      'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Agent Instructions Modal - Only shows when manually triggered */}
      {showAgentInstructions && (
        <div className="agent-instructions-modal">
          <div className="instructions-card">
            <h2>🚀 AaravPOS Agent Setup</h2>
            <p className="instructions-intro">
              To connect to physical printers and cash drawers, you need to install the AaravPOS Agent on your computer.
            </p>

            <div className="instructions-steps">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>Download & Install</h4>
                  <p>Download the agent for your operating system and install it.</p>
                  <button className="btn btn-primary btn-download" onClick={downloadAgent}>
                    <span className="download-icon">⬇️</span>
                    Download Agent
                  </button>
                </div>
              </div>

              <div className="step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>Run the Agent</h4>
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
                  <h4>Manual Connection</h4>
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
                🎭 Use Demo Mode
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
              ×
            </button>
          </div>
        </div>
      )}

      <div className="main-content">
        <div className="control-panel">
          <div className="card">
            <h3>Manual Connection Settings</h3>

            <div className="connection-status-display">
              <div className={`status-badge ${getConnectionStatusColor()}`}>
                {connectionStatus.toUpperCase()}
              </div>
              {connectionMode === 'demo' && (
                <span className="demo-note">(Printing is simulated)</span>
              )}
            </div>

            {connectionMode === 'agent' && (
              <>
                <div className="form-group">
                  <label>WebSocket URL</label>
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
                  <label>Authentication Token</label>
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
                    {connectionStatus === 'connecting' ? 'Connecting...' :
                      connectionStatus === 'connected' ? 'Reconnect' : 'Connect'}
                  </button>
                  <button
                    onClick={disconnectWebSocket}
                    className="btn btn-danger"
                    disabled={connectionStatus === 'disconnected' || connectionStatus === 'demo'}
                  >
                    Disconnect
                  </button>
                  <button
                    onClick={manualDetectAgent}
                    className="btn btn-secondary"
                    disabled={connectionStatus === 'connecting'}
                  >
                    Detect Agent
                  </button>
                  <button
                    onClick={sendHealthCheck}
                    className="btn btn-secondary"
                    disabled={!isConnected && connectionMode !== 'demo'}
                  >
                    Health Check
                  </button>
                </div>

                <div className="agent-actions">
                  <button
                    onClick={() => setShowAgentInstructions(true)}
                    className="btn-link"
                  >
                    📥 Need Agent Setup?
                  </button>
                </div>
              </>
            )}

            {connectionMode === 'demo' && (
              <div className="demo-connection-info">
                <p>Demo mode is active. All print actions are simulated.</p>
                <div className="button-group">
                  <button
                    onClick={sendHealthCheck}
                    className="btn btn-secondary"
                  >
                    Demo Health Check
                  </button>
                  <button
                    onClick={switchToAgentMode}
                    className="btn btn-primary"
                  >
                    Switch to Agent Mode
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Printers</h3>
              <button
                onClick={handleRefreshPrinters}
                className="btn-icon"
                title="Refresh printers"
                disabled={!isConnected && connectionMode !== 'demo'}
              >
                ↻
              </button>
            </div>

            {connectionMode === 'demo' ? (
              <div className="demo-printer-info">
                <div className="demo-printer-list">
                  <div className="printer-item demo">
                    <span className="printer-name">📋 Demo Thermal Printer</span>
                    <span className="printer-status ready">READY</span>
                  </div>
                  <div className="printer-item demo">
                    <span className="printer-name">🧾 Demo Receipt Printer</span>
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
                    Selected: <strong>{selectedPrinter}</strong>
                  </div>
                )}
                {printers.length === 0 && isConnected && (
                  <div className="no-printers">
                    <p>No printers found. Make sure printers are connected and drivers are installed.</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="queue-header">
              <h3>Print Queue</h3>
              <button
                className="btn-icon"
                onClick={() => setShowQueueDetails(!showQueueDetails)}
                title={showQueueDetails ? "Hide details" : "Show details"}
              >
                {showQueueDetails ? '▲' : '▼'}
              </button>
            </div>

            <div className="queue-status">
              {/* ─── Header / Stats ───────────────────────── */}
              <div className="queue-stats">
                <div className="stat-item">
                  <span className="stat-label">Queue</span>
                  <span className="stat-value queue-count">
                    {queueStatus.queueSize}
                  </span>
                </div>

                <div className="stat-item">
                  <span className="stat-label">Status</span>
                  <span
                    className={`stat-value print-status ${queueStatus.isProcessing ? 'printing' : 'idle'
                      }`}
                  >
                    {queueStatus.isProcessing ? '🖨️ Printing…' : '🟢 Idle'}
                  </span>
                </div>
              </div>

              {/* Queue Overview Stats */}
              <div className="queue-overview">
                <div className="overview-stats">
                  <div className="overview-stat">
                    <span className="stat-label">Total Jobs:</span>
                    <span className="stat-value">{allJobs.length}</span>
                  </div>
                  <div className="overview-stat">
                    <span className="stat-label">Successful:</span>
                    <span className="stat-value success">
                      {allJobs.filter(j => j.status === 'completed').length}
                    </span>
                  </div>
                  <div className="overview-stat">
                    <span className="stat-label">Failed:</span>
                    <span className="stat-value failed">
                      {allJobs.filter(j => j.status === 'failed').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* ─── Job List ─────────────────────────────── */}
              <div className="job-list">
                {allJobs.length === 0 && (
                  <div className="job empty">Queue is empty</div>
                )}

                {allJobs.map(job => {
                  const jobType = getJobTypeDisplay(job.type);
                  const statusDisplay = getJobStatusDisplay(job);
                  const isStopped = printQueue.current?.isStopped;

                  return (
                    <div
                      key={job.id}
                      className={`job job-${job.__kind} job-status-${job.status} job-type-${jobType.color}`}
                      title={`ID: ${job.id}\nCreated: ${new Date(job.timestamp).toLocaleTimeString()}`}
                    >
                      {/* Left: icon + label */}
                      <div className="job-main">
                        {job.__kind === 'current' ? (
                          <Loader2 className="job-icon spinning" size={16} />
                        ) : (
                          <span className="job-icon">{jobType.icon}</span>
                        )}

                        <div className="job-details">
                          <span className="job-label">
                            {jobType.label}
                            {job.data?.printerName && (
                              <span className="job-printer"> on {job.data.printerName}</span>
                            )}
                          </span>
                          <span className="job-timestamp">
                            {new Date(job.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <span className={`job-status status-${job.status}`}>
                          {statusDisplay}
                        </span>
                      </div>

                      {/* Right: actions */}
                      <div className="job-actions">
                        {job.__kind === 'current' && (
                          <>
                            {isStopped ? (
                              <button
                                className="icon-btn resume"
                                onClick={resumeJobs}
                                title="Resume processing"
                              >
                                <Play size={16} />
                              </button>
                            ) : (
                              <button
                                className="icon-btn stop"
                                onClick={stopJobs}
                                title="Stop queue (pauses after current job)"
                              >
                                <StopCircle size={16} />
                              </button>
                            )}

                            <button
                              className="icon-btn cancel"
                              onClick={() => {
                                cancelCurrentJob();
                                addLog(`Job ${job.id.substring(0, 8)} terminated`, 'warning');
                              }}
                              title="Terminate this job immediately"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}

                        {job.__kind === 'queued' && (
                          <button
                            className="icon-btn cancel"
                            onClick={() => cancelQueuedJob(job.id)}
                            title="Remove from queue"
                          >
                            <XCircle size={16} />
                          </button>
                        )}

                        {job.__kind === 'history' && job.status === 'failed' && (
                          <button
                            className="icon-btn retry"
                            onClick={() => {
                              addLog(`Retry not implemented for job ${job.id.substring(0, 8)}`, 'info');
                            }}
                            title="Retry failed job"
                            disabled
                          >
                            <RefreshCw size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="form-group">
              <label>Print Delay (ms)</label>
              <input
                type="range"
                min="500"
                max="3000"
                step="500"
                value={printDelay}
                onChange={(e) => setPrintDelay(parseInt(e.target.value))}
                className="delay-slider"
              />
              <div className="delay-display">
                <span>{printDelay}ms delay</span>
                <span className="delay-help">
                  {printDelay <= 1000 ? 'Fast' :
                    printDelay <= 2000 ? 'Normal' : 'Slow'}
                </span>
              </div>
            </div>

            <div className="action-buttons">
              <button
                onClick={handlePrintText}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected}
                className="btn btn-action btn-print"
              >
                Print Text
              </button>
              <button
                onClick={handleTestPrint}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected}
                className="btn btn-action btn-test"
              >
                Test Print
              </button>
              <button
                onClick={handleOpenCashDrawer}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected}
                className="btn btn-action btn-cash"
              >
                Open Drawer
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handlePrintBarcode(`INV-${Date.now().toString(36).toUpperCase()}`)}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || !isConnected}
              >
                🧾 Print Barcode
              </button>

              <QueueManagementPanel
                queueStats={{
                  queue: queueStatus.queueSize,
                  totalJobs: allJobs.length,
                  completed: allJobs.filter(j => j.status === 'completed').length,
                  failed: allJobs.filter(j => j.status === 'failed').length
                }}
                jobs={allJobs.map(job => ({
                  id: job.id,
                  status: job.status.charAt(0).toUpperCase() + job.status.slice(1), // Capitalize
                  timestamp: new Date(job.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  }),
                  type: job.type || 'print'
                }))}
                onGenerateTestJobs={generateTestJobs}
                onStopJobs={stopJobs}
                onClearQueue={clearPrintQueue}
                onPauseJob={(jobId) => {
                  // Add pause functionality to your PrintQueue class
                  // You'll need to add this method to PrintQueue class
                  addLog(`Pausing job ${jobId.substring(0, 8)}`, 'warning');
                }}
                onCancelJob={cancelQueuedJob}
                onResumeQueue={resumeJobs}
                autoRefresh={autoRefresh}
                onAutoRefreshChange={setAutoRefresh}
                isQueueProcessing={queueStatus.isProcessing}
              />
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
                Auto-refresh health info (every 5s)
              </label>
            </div>
          </div>

          {connectionMode === 'demo' && (
            <div className="card demo-notice">
              <h3>🎭 Demo Mode Active</h3>
              <p>All print actions are simulated. Perfect for testing without a printer.</p>
              <div className="demo-features">
                <div className="feature">
                  <span className="feature-icon">✅</span>
                  <span>Simulated printing</span>
                </div>
                <div className="feature">
                  <span className="feature-icon">✅</span>
                  <span>Test receipt generation</span>
                </div>
                <div className="feature">
                  <span className="feature-icon">✅</span>
                  <span>Queue management</span>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={switchToAgentMode}
              >
                Switch to Manual Agent Mode
              </button>
            </div>
          )}
        </div>

        <div className="text-panel">
          <div className="card">
            <h3>Text to Print</h3>
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
            <div className="text-actions">
              <button
                className="btn btn-sm"
                onClick={() => setTextToPrint(`            AARAVPOS STORE
========================================
Invoice:      ${Date.now().toString(36).toUpperCase()}
Date:         ${new Date().toLocaleDateString()}
Time:         ${new Date().toLocaleTimeString()}
========================================
Item 1                     x1   25.00
Item 2                     x2   15.00
========================================
TOTAL:                        55.00
========================================
Thank you for your business!`)}
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
            <h3>System Status</h3>
            <div className="environment-status">
              <div className="status-item">
                <span className="status-label">Environment:</span>
                <span className={`status-value ${isLocalhost ? 'local' : 'hosted'}`}>
                  {isLocalhost ? 'Local' : 'Hosted'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Connection Mode:</span>
                <span className={`status-value ${connectionMode}`}>
                  {connectionMode === 'demo' ? 'Demo' : 'Manual Agent'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Agent Detected:</span>
                <span className={`status-value ${agentDetected ? 'detected' : 'not-detected'}`}>
                  {agentDetected ? 'Yes ✅' : 'No ❌'}
                </span>
              </div>
            </div>

            {healthInfo ? (
              <div className="status-info">
                <div className="status-row">
                  <span>Server Status:</span>
                  <span className={`status-badge ${healthInfo.ok ? 'healthy' : 'error'}`}>
                    {healthInfo.ok ? 'Healthy' : 'Error'}
                  </span>
                </div>
                <div className="status-row">
                  <span>Platform:</span>
                  <span>{healthInfo.platform}</span>
                </div>
                <div className="status-row">
                  <span>Printers Found:</span>
                  <span className="printer-count">{healthInfo.totalPrinters}</span>
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
            <h3>Activity Log</h3>
            <div className="log-container">
              {logs.length > 0 ? (
                <ul className="log-list">
                  {logs.map((log) => (
                    <li key={log.id} className={getLogTypeClass(log.type)}>
                      <span className="log-time">[{log.timestamp}]</span>
                      <span className="log-message">{log.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="no-logs">No activity yet</div>
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
              <h3>Last Response</h3>
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
            AaravPOS Print Tester •
            <span className={`env-indicator ${isLocalhost ? 'local' : 'hosted'}`}>
              {isLocalhost ? ' 🏠 Local Mode' : ' 🌐 Hosted Mode'}
            </span>
            • Connection: <span className={`connection-indicator ${getConnectionStatusColor()}`}>
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
                📥 Need help setting up the agent?
              </button>
            )}
            {connectionMode === 'demo' && (
              <span>Running in demo mode. Switch to agent mode for physical printing.</span>
            )}
          </p>
          {renderEnvironmentInfo()}
        </div>
      </footer>
    </div>
  );
}

export default App;