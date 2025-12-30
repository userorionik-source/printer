// App.js - Production Ready Version with Environment Variables
import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// Environment configuration
const ENV_CONFIG = {
  defaultWsUrl: process.env.REACT_APP_WS_URL || 'ws://127.0.0.1:9978',
  defaultToken: process.env.REACT_APP_TOKEN || 'supersecret',
  agentDownloadUrl: process.env.REACT_APP_AGENT_DOWNLOAD_URL || 'https://drive.google.com/file/d/1hai4ayzrxNN02JwVmRpC95c9XtJW8cpf/view?usp=sharing',
  enableDebugMode: process.env.REACT_APP_DEBUG === 'true'
};

// Job types
const JOB_TYPES = {
  PRINT: 'print',
  TEST_PRINT: 'test_print',
  CASH_DRAWER: 'cash_drawer'
};

// Print Queue class (same as before)
class PrintQueue {
  constructor(onQueueUpdate) {
    this.queue = [];
    this.processing = false;
    this.currentJob = null;
    this.onQueueUpdate = onQueueUpdate;
    this.jobHistory = [];
    this.maxHistory = 20;
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
    this.process();

    return queueJob;
  }

  async process() {
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

      if (this.jobHistory.length > this.maxHistory) {
        this.jobHistory = this.jobHistory.slice(0, this.maxHistory);
      }
    } catch (error) {
      this.currentJob.status = 'failed';
      this.currentJob.error = error.message;
      this.jobHistory.unshift({ ...this.currentJob });
    } finally {
      this.currentJob = null;
      this.processing = false;

      setTimeout(() => {
        this.process();
      }, 500);
    }

    this.notifyUpdate();
  }

  clear() {
    const clearedJobs = this.queue.length;
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

  getStatus() {
    return {
      queueSize: this.queue.length,
      isProcessing: this.processing,
      currentJob: this.currentJob,
      recentHistory: this.jobHistory.slice(0, 5)
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

  // State (same as before, but using ENV_CONFIG)
  const [agentDetected, setAgentDetected] = useState(false);
  const [connectionMode, setConnectionMode] = useState('auto');
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
    isProcessing: false,
    currentJob: null,
    recentHistory: []
  });
  const [lastResponse, setLastResponse] = useState(null);
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [requestId, setRequestId] = useState(1);
  const [showAgentInstructions, setShowAgentInstructions] = useState(!isLocalhost);
  const [printDelay, setPrintDelay] = useState(1000);
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [agentStatus, setAgentStatus] = useState({
    installed: false,
    version: null,
    platform: null
  });

  const ws = useRef(null);
  const agentDetectionTimeoutRef = useRef(null);
  const printQueue = useRef(null);
  const lastPrintTimeRef = useRef(0);

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

  // Enhanced agent detection with multiple fallbacks
  const detectAgent = useCallback(async () => {
    addLog('Detecting AaravPOS Agent...', 'info');

    // Clear any existing timeout
    if (agentDetectionTimeoutRef.current) {
      clearTimeout(agentDetectionTimeoutRef.current);
    }

    // Try multiple detection methods
    const detectionMethods = [
      // Method 1: Direct WebSocket connection (localhost only)
      () => {
        const testWs = new WebSocket(`ws://127.0.0.1:9978?token=${token}`);

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            testWs.close();
            reject(new Error('Timeout'));
          }, 2000);

          testWs.onopen = () => {
            clearTimeout(timeout);
            resolve({
              method: 'direct',
              url: 'ws://127.0.0.1:9978'
            });
          };

          testWs.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
          };
        });
      },

      // Method 2: Custom URL (if provided)
      () => {
        if (!customAgentUrl.trim()) {
          return Promise.reject(new Error('No custom URL'));
        }

        const testWs = new WebSocket(`${customAgentUrl}?token=${token}`);

        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            testWs.close();
            reject(new Error('Timeout'));
          }, 3000);

          testWs.onopen = () => {
            clearTimeout(timeout);
            resolve({
              method: 'custom',
              url: customAgentUrl
            });
          };

          testWs.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
          };
        });
      },

      // Method 3: Try HTTPS tunnel (for advanced setups)
      () => {
        return Promise.reject(new Error('HTTPS tunnel not configured'));
      }
    ];

    // Try each detection method
    for (let i = 0; i < detectionMethods.length; i++) {
      try {
        const result = await detectionMethods[i]();
        setAgentDetected(true);
        setAgentStatus(prev => ({
          ...prev,
          installed: true,
          detectedVia: result.method
        }));
        addLog(`Agent detected via ${result.method}: ${result.url}`, 'success');

        // Store successful URL for connection
        if (result.method === 'custom') {
          setServerUrl(result.url);
        }

        // Connect WebSocket if in agent mode
        if (connectionMode === 'agent' || connectionMode === 'auto') {
          setTimeout(() => connectWebSocket(result.url), 500);
        }

        return result.url;
      } catch (error) {
        console.log(`Detection method ${i} failed:`, error.message);
      }
    }

    // If all methods fail
    setAgentDetected(false);
    setAgentStatus(prev => ({ ...prev, installed: false }));
    addLog('Agent not found — switching to demo mode', 'warning')

    if (connectionMode === 'agent') {
      setShowAgentInstructions(true);
    }

    setConnectionMode('demo');
    connectWebSocket();
    return null;
  }, [addLog, isLocalhost, token, customAgentUrl, connectionMode]);

  const connectWebSocket = useCallback((customUrl = null) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.close();
    }

    let url;
    let isDemo = false;

    if (connectionMode === 'demo') {
      // Demo mode - use local simulation
      isDemo = true;
      addLog('Starting demo mode (simulated printing)', 'info');

      // For demo mode, we simulate connection
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

      return;
    }

    // Agent mode - try to connect
    if (customUrl) {
      url = `${customUrl}?token=${token}`;
    } else if (customAgentUrl) {
      url = `${customAgentUrl}?token=${token}`;
    } else {
      url = `ws://127.0.0.1:9978?token=${token}`;
    }

    addLog(`Connecting to agent at ${url}...`, 'info');

    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        addLog('Connected to AaravPOS Agent', 'success');
        sendHealthCheck();
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

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        addLog('Disconnected from agent', 'warning');

        // Try to reconnect if in agent mode
        if (connectionMode === 'agent' && agentDetected) {
          setTimeout(() => connectWebSocket(customUrl || customAgentUrl), 2000);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);

        if (connectionMode === 'agent') {
          addLog('Failed to connect to agent', 'error');
          // Show instructions if this is the first failure
          if (!agentDetected) {
            setTimeout(() => setShowAgentInstructions(true), 1000);
          }
        }
      };
    } catch (error) {
      addLog(`Connection error: ${error.message}`, 'error');
      setIsConnected(false);
    }
  }, [connectionMode, token, customAgentUrl, agentDetected, addLog]);

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
  }, []);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('Received:', data);
    setLastResponse(data);

    switch (data.type) {
      case 'connected':
        setIsConnected(true);
        break;

      case 'health_response':
        setHealthInfo(data.payload);
        setPrinters(data.payload.printers || []);
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
        break;
    }
  }, [addLog, selectedPrinter]);

  const sendHealthCheck = useCallback(() => {
    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);

    if (sendMessage({
      type: 'health',
      requestId: reqId,
      payload: {}
    })) {
      addLog('Sending health check...', 'info');
    } else {
      addLog('Not connected to server', 'error');
    }
  }, [sendMessage, requestId, addLog]);

  const handlePrintText = useCallback(async () => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
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
          addLog(`Printing to ${selectedPrinter || 'Demo Printer'}...`, 'info');
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
        JOB_TYPES.PRINT,
        { printerName: selectedPrinter || 'Demo Printer', type: 'Print Text' }
      );
      addLog(`Print job added to queue (ID: ${queueJob.id.substring(0, 8)})`, 'info');
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage, textToPrint]);

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
      addLog(`Cleared ${cleared} job(s) from the queue`, 'info');
    }
  }, [addLog]);

  const cancelCurrentJob = useCallback(() => {
    if (printQueue.current && queueStatus.currentJob) {
      const cancelled = printQueue.current.cancelJob(queueStatus.currentJob.id);
      if (cancelled) {
        addLog(`Cancelled job: ${queueStatus.currentJob.id.substring(0, 8)}`, 'warning');
      }
    }
  }, [queueStatus.currentJob, addLog]);

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
      case JOB_TYPES.PRINT: return '📄 Print';
      case JOB_TYPES.TEST_PRINT: return '🧪 Test';
      case JOB_TYPES.CASH_DRAWER: return '💰 Drawer';
      default: return type;
    }
  };

  const switchToDemoMode = useCallback(() => {
    setConnectionMode('demo');
    setShowAgentInstructions(false);

    if (ws.current) {
      ws.current.close();
    }

    setTimeout(() => {
      connectWebSocket();
    }, 500);
  }, [connectWebSocket]);

  const switchToAgentMode = useCallback(() => {
    setConnectionMode('agent');
    setShowAgentInstructions(false);

    if (ws.current) {
      ws.current.close();
    }

    setTimeout(() => {
      detectAgent();
    }, 500);
  }, [detectAgent]);

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

  // Initial detection based on environment
  useEffect(() => {
    detectAgent(); // ALWAYS try agent first

    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  // Reconnect when connection mode changes
  useEffect(() => {
    if (connectionMode === 'agent' && agentDetected && !isConnected) {
      detectAgent();
    }
  }, [connectionMode, agentDetected, isConnected]);

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
              disabled={false}
            >
              <span className="mode-indicator agent"></span>
              Local Agent
              {!isLocalhost && <span className="mode-note">(Requires setup)</span>}
            </button>
            <button
              className={`mode-btn ${connectionMode === 'demo' ? 'active' : ''}`}
              onClick={switchToDemoMode}
            >
              <span className="mode-indicator demo"></span>
              Demo Mode
            </button>
          </div>
          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>
              {isConnected ? (
                connectionMode === 'demo' ? 'Demo Mode' : 'Agent Connected'
              ) : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Enhanced Agent Instructions Modal */}
      {showAgentInstructions && (
        <div className="agent-instructions-modal">
          <div className="instructions-card">
            <h2>🚀 AaravPOS Agent Setup</h2>
            <p className="instructions-intro">
              To connect to physical printers and cash drawers, you need to install the AaravPOS Agent on your computer.
            </p>

            <div className="instructions-tabs">
              <div className="tab active">Quick Setup</div>
              <div className="tab">Advanced</div>
            </div>

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
                  <div className="os-links">
                    <a href="#" onClick={(e) => {
                      e.preventDefault();
                      addLog('Windows download selected', 'info');
                      window.open('https://github.com/yourusername/aaravpos-agent/releases/latest/download/AaravPOS-Agent-Windows.exe', '_blank');
                    }}>Windows (.exe)</a>
                    <a href="#" onClick={(e) => {
                      e.preventDefault();
                      addLog('macOS download selected', 'info');
                      window.open('https://github.com/yourusername/aaravpos-agent/releases/latest/download/AaravPOS-Agent-macOS.dmg', '_blank');
                    }}>macOS (.dmg)</a>
                    <a href="#" onClick={(e) => {
                      e.preventDefault();
                      addLog('Linux download selected', 'info');
                      window.open('https://github.com/yourusername/aaravpos-agent/releases/latest/download/AaravPOS-Agent-Linux.AppImage', '_blank');
                    }}>Linux (.AppImage)</a>
                  </div>
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
                      <span className="info-label">Token:</span>
                      <code>supersecret</code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>Connect</h4>
                  <p>Once installed, click "Try Again" or refresh this page.</p>

                  <div className="custom-connection">
                    <h5>Advanced: Custom Connection</h5>
                    <div className="form-group">
                      <label>Agent WebSocket URL:</label>
                      <input
                        type="text"
                        value={customAgentUrl}
                        onChange={(e) => setCustomAgentUrl(e.target.value)}
                        placeholder="ws://your-ip:9978"
                        className="form-control"
                      />
                      <small>For remote connections or custom setups</small>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        if (customAgentUrl) {
                          setServerUrl(customAgentUrl);
                          detectAgent();
                        }
                      }}
                    >
                      Connect with Custom URL
                    </button>
                  </div>
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
                🎭 Continue in Demo Mode
              </button>
              <button
                className="btn btn-primary"
                onClick={detectAgent}
              >
                🔄 Try Again (Detect Agent)
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
            <h3>Connection Settings</h3>
            <div className="environment-info">
              <div className="env-badge">
                {isLocalhost ? 'Local Environment' : 'Hosted Environment'}
              </div>
              {!isLocalhost && (
                <p className="env-note">
                  <small>⚠️ Hosted apps can't access local printers directly. Install the agent to enable local printing.</small>
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Connection Mode</label>
              <div className="mode-display">
                <span className={`mode-badge ${connectionMode}`}>
                  {connectionMode === 'demo' ? 'DEMO MODE' : 'LOCAL AGENT'}
                </span>
                {connectionMode === 'demo' && (
                  <span className="demo-note">(Printing is simulated)</span>
                )}
                {connectionMode === 'agent' && !agentDetected && (
                  <span className="demo-note">(Agent not detected)</span>
                )}
              </div>
            </div>

            {connectionMode === 'agent' && (
              <>
                <div className="form-group">
                  <label>Agent WebSocket URL</label>
                  <input
                    type="text"
                    value={customAgentUrl || serverUrl}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomAgentUrl(value);
                      if (value) setServerUrl(value);
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
              </>
            )}

            <div className="button-group">
              <button
                onClick={() => connectWebSocket(customAgentUrl || serverUrl)}
                className="btn btn-primary"
                disabled={connectionMode === 'agent' && !agentDetected && !customAgentUrl}
              >
                {isConnected ? 'Reconnect' : 'Connect'}
              </button>
              <button
                onClick={sendHealthCheck}
                className="btn btn-secondary"
                disabled={!isConnected}
              >
                Health Check
              </button>
              {!isLocalhost && connectionMode !== 'demo' && (
                <button
                  onClick={() => setShowAgentInstructions(true)}
                  className="btn btn-install"
                >
                  📥 Setup Agent
                </button>
              )}
            </div>

            {!isLocalhost && (
              <div className="hosted-notice">
                <p>
                  <strong>Hosted Mode:</strong> This app is running on the web.
                  To connect to local printers, download and install the AaravPOS Agent.
                </p>
                <button
                  className="btn-link"
                  onClick={() => setShowAgentInstructions(true)}
                >
                  Click here for setup instructions
                </button>
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
                disabled={!isConnected || connectionMode === 'demo'}
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
                    {printers.map((printer) => (
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
              <div className="queue-stats">
                <div className="stat-item">
                  <span className="stat-label">Queue:</span>
                  <span className="stat-value queue-count">{queueStatus.queueSize}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Status:</span>
                  <span className={`stat-value print-status ${queueStatus.isProcessing ? 'printing' : 'idle'}`}>
                    {queueStatus.isProcessing ? '🖨️ Printing...' : '🟢 Idle'}
                  </span>
                </div>
              </div>

              {queueStatus.currentJob && (
                <div className="current-job">
                  <span className="current-job-label">Current:</span>
                  <span className="current-job-type">
                    {getJobTypeDisplay(queueStatus.currentJob.type)}
                  </span>
                  <button
                    className="btn-cancel-job"
                    onClick={cancelCurrentJob}
                    title="Cancel this job"
                  >
                    ✕
                  </button>
                </div>
              )}
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
                onClick={clearPrintQueue}
                disabled={queueStatus.queueSize === 0}
                className="btn btn-action btn-clear"
              >
                Clear Queue
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
                        <span className="job-type">{getJobTypeDisplay(queueStatus.currentJob.type)}</span>
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
                Auto-refresh health info
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
              <p>To use physical printers:</p>
              <button
                className="btn btn-install"
                onClick={() => setShowAgentInstructions(true)}
              >
                📥 Install Local Agent
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
                <span className="status-label">Agent Status:</span>
                <span className={`status-value ${agentDetected ? 'detected' : 'not-detected'}`}>
                  {agentDetected ? 'Detected ✅' : 'Not Detected ❌'}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Mode:</span>
                <span className={`status-value ${connectionMode}`}>
                  {connectionMode === 'demo' ? 'Demo' : 'Local Agent'}
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
            {queueStatus.queueSize > 0 && ` • Queue: ${queueStatus.queueSize} jobs`}
            {queueStatus.isProcessing && ` • Printing...`}
          </p>
          <p className="footer-note">
            {!agentDetected && connectionMode !== 'demo' && (
              <button
                className="btn-link"
                onClick={() => setShowAgentInstructions(true)}
              >
                📥 Click here to install AaravPOS Agent
              </button>
            )}
            {connectionMode === 'demo' && (
              <span>Running in demo mode. Install agent for physical printing.</span>
            )}
          </p>
          {renderEnvironmentInfo()}
        </div>
      </footer>
    </div>
  );
}

export default App;