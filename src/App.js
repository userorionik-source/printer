import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [serverUrl, setServerUrl] = useState('ws://localhost:9978');
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
  
  const ws = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [
      { id: Date.now(), message, type, timestamp },
      ...prev.slice(0, 19)
    ]);
  };

  const connectWebSocket = () => {
    if (ws.current) {
      ws.current.close();
    }

    addLog(`Connecting to ${serverUrl}...`, 'info');
    
    ws.current = new WebSocket(`${serverUrl}?token=${token}`);
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      addLog('Connected to print server', 'success');
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
      addLog('Connection error', 'error');
    };
  };

  const sendMessage = (message) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  };

  const handleWebSocketMessage = (data) => {
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
    }
  };

  const sendHealthCheck = () => {
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
  };

  const handlePrintText = () => {
    if (!selectedPrinter) {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);
    
    setIsLoading(true);
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
    }
    
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleTestPrint = () => {
    if (!selectedPrinter) {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);
    
    setIsLoading(true);
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
    }
    
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleOpenCashDrawer = () => {
    if (!selectedPrinter) {
      addLog('Please select a printer first', 'warning');
      return;
    }

    const reqId = requestId.toString();
    setRequestId(prev => prev + 1);
    
    setIsLoading(true);
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
    }
    
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleRefreshPrinters = () => {
    sendHealthCheck();
  };

  const getLogTypeClass = (type) => {
    switch (type) {
      case 'success': return 'log-success';
      case 'error': return 'log-error';
      case 'warning': return 'log-warning';
      default: return 'log-info';
    }
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
  }, [autoRefresh, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <h1>AaravPOS Print Server Tester</h1>
        <div className="status-indicator">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="main-content">
        {/* Left Panel - Controls */}
        <div className="control-panel">
          <div className="card">
            <h3>Connection Settings</h3>
            <div className="form-group">
              <label>Server URL</label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="form-group">
              <label>Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="form-control"
              />
            </div>
            <div className="button-group">
              <button 
                onClick={connectWebSocket}
                className="btn btn-primary"
              >
                Connect
              </button>
              <button 
                onClick={sendHealthCheck}
                className="btn btn-secondary"
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
              >
                ↻
              </button>
            </div>
            <div className="form-group">
              <label>Select Printer</label>
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="form-control"
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
          </div>

          <div className="card">
            <h3>Quick Actions</h3>
            <div className="action-buttons">
              <button
                onClick={handlePrintText}
                disabled={!selectedPrinter || isLoading}
                className="btn btn-action btn-print"
              >
                {isLoading ? 'Processing...' : 'Print Text'}
              </button>
              <button
                onClick={handleTestPrint}
                disabled={!selectedPrinter || isLoading}
                className="btn btn-action btn-test"
              >
                Test Print
              </button>
              <button
                onClick={handleOpenCashDrawer}
                disabled={!selectedPrinter || isLoading}
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
                />
                Auto-refresh health info
              </label>
            </div>
          </div>
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
                <div className="status-row">
                  <span>Default Printer:</span>
                  <span>{healthInfo.defaultPrinter || 'None'}</span>
                </div>
                {healthInfo.printers && healthInfo.printers.length > 0 && (
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
                Connect to server to see status
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
        <p>Electron Print Server Tester • Connect to ws://localhost:9978</p>
      </footer>
    </div>
  );
}

export default App;