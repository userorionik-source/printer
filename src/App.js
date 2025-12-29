import React, { useState, useEffect, useRef, useCallback } from 'react';

function App() {
  // Agent connection settings - try local agent first, fallback to demo
  const [agentDetected, setAgentDetected] = useState(false);
  const [connectionMode, setConnectionMode] = useState('auto'); // 'auto', 'agent', 'demo'
  const [serverUrl, setServerUrl] = useState('ws://127.0.0.1:9978'); // Fixed port to match print-server.js
  const [token, setToken] = useState('supersecret');
  const [isConnected, setIsConnected] = useState(false);
  const [healthInfo, setHealthInfo] = useState(null);
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [textToPrint, setTextToPrint] = useState(`            AARAVPOS STORE
========================================
Invoice:      8F0A8-BE4/2025-26/00002
Date:         2025-11-18 03:50:01
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
  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState(null);
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [requestId, setRequestId] = useState(1);
  const [showAgentInstructions, setShowAgentInstructions] = useState(false);
  
  const ws = useRef(null);
  const agentDetectionTimeoutRef = useRef(null);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [
      { id: Date.now(), message, type, timestamp },
      ...prev.slice(0, 19)
    ]);
  }, []);

  // Detect if agent is running
  const detectAgent = useCallback(() => {
    addLog('Detecting local agent...', 'info');
    
    // Clear any existing timeout
    if (agentDetectionTimeoutRef.current) {
      clearTimeout(agentDetectionTimeoutRef.current);
    }
    
    // Try to connect to agent
    const testWs = new WebSocket(`ws://127.0.0.1:9978?token=${token}`);
    
    // Set timeout for agent detection
    agentDetectionTimeoutRef.current = setTimeout(() => {
      if (testWs.readyState !== WebSocket.OPEN) {
        testWs.close();
        setAgentDetected(false);
        addLog('Local agent not detected', 'warning');
        
        // If in auto mode and agent not found, show instructions
        if (connectionMode === 'auto') {
          setShowAgentInstructions(true);
        }
      }
    }, 2000);
    
    testWs.onopen = () => {
      clearTimeout(agentDetectionTimeoutRef.current);
      setAgentDetected(true);
      setShowAgentInstructions(false);
      addLog('Local agent detected!', 'success');
      
      // Send test message to verify full connection
      testWs.send(JSON.stringify({
        type: 'health',
        requestId: 'detect',
        payload: {}
      }));
      
      setTimeout(() => {
        testWs.close();
        // Now connect with main WebSocket
        connectWebSocket();
      }, 500);
    };
    
    testWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'health_response') {
          addLog(`Agent verified: ${data.payload.platform}`, 'success');
        }
      } catch (error) {
        console.error('Error parsing test message:', error);
      }
    };
    
    testWs.onerror = () => {
      clearTimeout(agentDetectionTimeoutRef.current);
      testWs.close();
      setAgentDetected(false);
      
      if (connectionMode === 'auto' || connectionMode === 'agent') {
        setShowAgentInstructions(true);
      }
    };
    
    testWs.onclose = () => {
      // Clean up
      if (agentDetectionTimeoutRef.current) {
        clearTimeout(agentDetectionTimeoutRef.current);
      }
    };
  }, [addLog, connectionMode, token]);

  const connectWebSocket = useCallback(() => {
    if (ws.current) {
      ws.current.close();
    }

    let url;
    if (connectionMode === 'demo') {
      // Demo mode - use mock server or local simulation
      url = 'ws://127.0.0.1:9978?token=demo'; // We'll handle demo responses locally
    } else {
      // Agent mode - connect to local agent
      url = `ws://127.0.0.1:9978?token=${token}`;
    }
    
    addLog(`Connecting to ${connectionMode === 'demo' ? 'demo server' : 'local agent'}...`, 'info');
    
    ws.current = new WebSocket(url);
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      if (connectionMode === 'demo') {
        addLog('Connected to demo mode (simulated)', 'success');
      } else {
        addLog('Connected to local print agent', 'success');
      }
      
      // Send immediate health check
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
      addLog('Disconnected from server', 'warning');
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
      
      if (connectionMode !== 'demo') {
        addLog('Failed to connect to local agent', 'error');
        // Try to detect agent again
        if (connectionMode === 'agent') {
          setTimeout(detectAgent, 1000);
        }
      } else {
        addLog('Failed to connect to demo server', 'error');
      }
    };
  }, [connectionMode, token, addLog, detectAgent]);

  const sendMessage = useCallback((message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    }
    return false;
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
        // Handle any other message types
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

  const handlePrintText = useCallback(() => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);
    
    setIsLoading(true);
    
    if (connectionMode === 'demo') {
      // Simulate print for demo mode
      setTimeout(() => {
        addLog('Print simulated successfully (demo mode)', 'success');
        setIsLoading(false);
        setLastResponse({
          type: 'print_response',
          requestId: reqId,
          payload: {
            success: true,
            message: 'Printed to simulated printer (DEMO MODE)'
          }
        });
      }, 1000);
      return;
    }
    
    if (sendMessage({
      type: 'print_text',
      requestId: reqId,
      payload: {
        printerName: selectedPrinter,
        text: textToPrint
      }
    })) {
      addLog(`Printing to ${selectedPrinter}...`, 'info');
    } else {
      addLog('Not connected to server', 'error');
      setIsLoading(false);
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage, textToPrint]);

  const handleTestPrint = useCallback(() => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);
    
    setIsLoading(true);
    
    if (connectionMode === 'demo') {
      // Simulate test print for demo mode
      setTimeout(() => {
        addLog('Test print simulated (demo mode)', 'success');
        setIsLoading(false);
        setLastResponse({
          type: 'test_print_response',
          requestId: reqId,
          payload: {
            success: true,
            message: 'Test print sent (DEMO MODE)'
          }
        });
      }, 1000);
      return;
    }
    
    if (sendMessage({
      type: 'test_print',
      requestId: reqId,
      payload: {
        printerName: selectedPrinter
      }
    })) {
      addLog(`Sending test print to ${selectedPrinter}...`, 'info');
    } else {
      addLog('Not connected to server', 'error');
      setIsLoading(false);
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  const handleOpenCashDrawer = useCallback(() => {
    if (!selectedPrinter && connectionMode !== 'demo') {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);
    
    setIsLoading(true);
    
    if (connectionMode === 'demo') {
      // Simulate cash drawer for demo mode
      setTimeout(() => {
        addLog('Cash drawer simulated (demo mode)', 'success');
        setIsLoading(false);
        setLastResponse({
          type: 'cash_drawer_response',
          requestId: reqId,
          payload: {
            success: true,
            message: 'Cash drawer opened (DEMO MODE)'
          }
        });
      }, 1000);
      return;
    }
    
    if (sendMessage({
      type: 'open_cash_drawer',
      requestId: reqId,
      payload: {
        printerName: selectedPrinter
      }
    })) {
      addLog(`Opening cash drawer on ${selectedPrinter}...`, 'info');
    } else {
      addLog('Not connected to server', 'error');
      setIsLoading(false);
    }
  }, [selectedPrinter, connectionMode, requestId, addLog, sendMessage]);

  const handleRefreshPrinters = useCallback(() => {
    sendHealthCheck();
  }, [sendHealthCheck]);

  const getLogTypeClass = (type) => {
    switch (type) {
      case 'success': return 'log-success';
      case 'error': return 'log-error';
      case 'warning': return 'log-warning';
      default: return 'log-info';
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

  const downloadAgent = () => {
    // Update this URL to your actual agent download location
    window.open('https://github.com/yourusername/aaravpos-agent/releases/latest', '_blank');
  };

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

  // Detect agent on initial load
  useEffect(() => {
    detectAgent();
    
    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (agentDetectionTimeoutRef.current) {
        clearTimeout(agentDetectionTimeoutRef.current);
      }
    };
  }, [detectAgent]);

  // Reconnect when connection mode changes
  useEffect(() => {
    if (connectionMode !== 'auto' && !showAgentInstructions) {
      connectWebSocket();
    }
  }, [connectionMode, showAgentInstructions, connectWebSocket]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>AaravPOS Print Server Tester</h1>
        <div className="header-controls">
          <div className="mode-selector">
            <button 
              className={`mode-btn ${connectionMode === 'agent' ? 'active' : ''}`}
              onClick={switchToAgentMode}
              disabled={!agentDetected && connectionMode !== 'agent'}
            >
              <span className="mode-indicator agent"></span>
              Local Agent
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
                connectionMode === 'demo' ? 'Demo Connected' : 'Agent Connected'
              ) : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Agent Instructions Modal */}
      {showAgentInstructions && (
        <div className="agent-instructions-modal">
          <div className="instructions-card">
            <h2>🔌 Local Agent Required</h2>
            <p>To use physical printers and cash drawers, you need to install the AaravPOS Agent on your computer.</p>
            
            <div className="instructions-steps">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>Download the Agent</h4>
                  <p>Download and install the AaravPOS Agent for your operating system.</p>
                  <button className="btn btn-primary" onClick={downloadAgent}>
                    📥 Download Agent
                  </button>
                </div>
              </div>
              
              <div className="step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h4>Install & Run</h4>
                  <p>Install the application. It will run in your system tray (taskbar).</p>
                  <p className="note">The agent runs on <code>ws://127.0.0.1:9978</code></p>
                  <p className="note">Token: <code>supersecret</code></p>
                </div>
              </div>
              
              <div className="step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h4>Connect</h4>
                  <p>Once installed, refresh this page or click "Try Again" below.</p>
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
                🎭 Use Demo Mode Instead
              </button>
              <button 
                className="btn btn-primary"
                onClick={detectAgent}
              >
                🔄 Try Again
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
        {/* Left Panel - Controls */}
        <div className="control-panel">
          <div className="card">
            <h3>Connection Settings</h3>
            <div className="form-group">
              <label>Connection Mode</label>
              <div className="mode-display">
                <span className={`mode-badge ${connectionMode}`}>
                  {connectionMode === 'demo' ? 'DEMO MODE' : 'LOCAL AGENT'}
                </span>
                {connectionMode === 'demo' && (
                  <span className="demo-note">(Printing is simulated)</span>
                )}
              </div>
            </div>
            {connectionMode !== 'demo' && (
              <>
                <div className="form-group">
                  <label>Agent URL</label>
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="form-control"
                    disabled={!agentDetected}
                  />
                  <small className="form-help">Agent runs on ws://127.0.0.1:9978</small>
                </div>
                <div className="form-group">
                  <label>Token</label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="form-control"
                    disabled={!agentDetected}
                  />
                  <small className="form-help">Default token: supersecret</small>
                </div>
              </>
            )}
            <div className="button-group">
              <button 
                onClick={connectWebSocket}
                className="btn btn-primary"
                disabled={connectionMode !== 'demo' && !agentDetected}
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
            </div>
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
                <p>📋 <strong>Demo Printer</strong></p>
                <p className="demo-note">Printing is simulated. No physical printer required.</p>
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
              </>
            )}
          </div>

          <div className="card">
            <h3>Quick Actions</h3>
            <div className="action-buttons">
              <button
                onClick={handlePrintText}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || isLoading || !isConnected}
                className="btn btn-action btn-print"
              >
                {isLoading ? 'Processing...' : 'Print Text'}
              </button>
              <button
                onClick={handleTestPrint}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || isLoading || !isConnected}
                className="btn btn-action btn-test"
              >
                Test Print
              </button>
              <button
                onClick={handleOpenCashDrawer}
                disabled={(!selectedPrinter && connectionMode !== 'demo') || isLoading || !isConnected}
                className="btn btn-action btn-cash"
              >
                Open Cash Drawer
              </button>
            </div>
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
              <h3>🎭 Demo Mode</h3>
              <p>You're using demo mode. Print actions are simulated.</p>
              <p>To use physical printers:</p>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowAgentInstructions(true)}
              >
                Install Local Agent
              </button>
            </div>
          )}
        </div>

        {/* Middle Panel - Text Editor */}
        <div className="text-panel">
          <div className="card">
            <h3>Text to Print</h3>
            <textarea
              value={textToPrint}
              onChange={(e) => setTextToPrint(e.target.value)}
              className="text-editor"
              spellCheck="false"
            />
            <div className="text-stats">
              <span>Characters: {textToPrint.length}</span>
              <span>Lines: {textToPrint.split('\n').length}</span>
              {connectionMode === 'demo' && <span className="demo-badge">DEMO</span>}
            </div>
          </div>
        </div>

        {/* Right Panel - Status & Logs */}
        <div className="status-panel">
          <div className="card">
            <h3>Server Status</h3>
            {healthInfo ? (
              <div className="status-info">
                <div className="status-row">
                  <span>Status:</span>
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
                {connectionMode !== 'demo' && (
                  <div className="status-row">
                    <span>Default Printer:</span>
                    <span>{healthInfo.defaultPrinter || 'None'}</span>
                  </div>
                )}
                {connectionMode !== 'demo' && healthInfo.printers && healthInfo.printers.length > 0 && (
                  <div className="printer-list">
                    <h4>Available Printers:</h4>
                    <ul>
                      {healthInfo.printers.slice(0, 5).map((printer) => (
                        <li key={printer.name} className={printer.isConnected ? 'online' : 'offline'}>
                          <span className="printer-name">{printer.name}</span>
                          {printer.isDefault && <span className="default-badge">Default</span>}
                          <span className="printer-status">{printer.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="no-status">
                {connectionMode === 'demo' 
                  ? 'Connect to demo server to see status' 
                  : 'Connect to agent to see status'}
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
        <p>
          AaravPOS Print Tester • 
          {connectionMode === 'demo' 
            ? ' Demo Mode (simulated printing)' 
            : ` Agent Mode: ${agentDetected ? 'Detected' : 'Not detected'}`}
        </p>
        <p className="footer-note">
          {!agentDetected && connectionMode !== 'demo' && (
            <button 
              className="btn-link"
              onClick={() => setShowAgentInstructions(true)}
            >
              Install local agent for physical printing
            </button>
          )}
        </p>
      </footer>
    </div>
  );
}

export default App;