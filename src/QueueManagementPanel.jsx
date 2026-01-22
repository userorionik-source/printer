// File: QueueManagementPanel.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StopCircle, XCircle, Loader2, PauseCircle, PlayCircle } from 'lucide-react';
import './App.css';

const QueueManagementPanel = () => {
    const [queueStats, setQueueStats] = useState({
        queue: 20,
        totalJobs: 20,
        completed: 0,
        failed: 0
    });

    const [jobs, setJobs] = useState([
        { id: 19, status: 'Queued', timestamp: 'just now' },
        { id: 18, status: 'Queued', timestamp: 'just now' },
        { id: 17, status: 'Queued', timestamp: 'just now' },
        { id: 16, status: 'Queued', timestamp: 'just now' },
        { id: 15, status: 'Queued', timestamp: 'just now' },
        { id: 14, status: 'Queued', timestamp: 'just now' }
    ]);

    const [autoRefresh, setAutoRefresh] = useState(false);
    const [isQueueProcessing, setIsQueueProcessing] = useState(false);
    const processingIntervalRef = useRef(null);

    const generateTestJobs = useCallback(() => {
        const newJobs = [];
        for (let i = 20; i >= 1; i--) {
            newJobs.push({
                id: i,
                status: 'Queued',
                timestamp: 'just now'
            });
        }

        setJobs(newJobs);
        setQueueStats(prev => ({
            ...prev,
            queue: 20,
            totalJobs: 20,
            completed: 0,
            failed: 0
        }));
        setIsQueueProcessing(false);
    }, []);

    const stopJobs = useCallback(() => {
        setIsQueueProcessing(false);
        if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
            processingIntervalRef.current = null;
        }

        setJobs(prev => prev.map(job =>
            job.status === 'Processing' ? { ...job, status: 'Paused' } : job
        ));
    }, []);

    const clearQueue = useCallback(() => {
        setJobs(prev => prev.filter(job =>
            job.status === 'Completed' || job.status === 'Failed'
        ));
        setQueueStats(prev => ({
            ...prev,
            queue: 0
        }));
    }, []);

    const pauseJob = useCallback((jobId) => {
        setJobs(prev => prev.map(job =>
            job.id === jobId ? { ...job, status: 'Paused' } : job
        ));
    }, []);

    const cancelJob = useCallback((jobId) => {
        setJobs(prev => prev.filter(job => job.id !== jobId));
        setQueueStats(prev => ({
            ...prev,
            queue: Math.max(0, prev.queue - 1),
            totalJobs: Math.max(0, prev.totalJobs - 1)
        }));
    }, []);

    const simulateJobProcessing = useCallback(() => {
        if (!isQueueProcessing) return;

        setJobs(prev => {
            const newJobs = [...prev];
            let foundProcessing = false;
            let completedCount = 0;
            let failedCount = 0;

            for (let i = 0; i < newJobs.length; i++) {
                if (newJobs[i].status === 'Processing') {
                    foundProcessing = true;

                    // Simulate job completion with 90% success rate
                    const isSuccess = Math.random() > 0.1;
                    newJobs[i].status = isSuccess ? 'Completed' : 'Failed';
                    newJobs[i].timestamp = 'completed';

                    if (isSuccess) completedCount++;
                    else failedCount++;
                    break;
                }
            }

            if (!foundProcessing) {
                // Find first queued job and start processing it
                for (let i = 0; i < newJobs.length; i++) {
                    if (newJobs[i].status === 'Queued') {
                        newJobs[i].status = 'Processing';
                        newJobs[i].timestamp = 'processing...';
                        break;
                    }
                }
            }

            return newJobs;
        });
    }, [isQueueProcessing]);

    const startQueueProcessing = useCallback(() => {
        if (isQueueProcessing) return;

        setIsQueueProcessing(true);

        // Clear any existing interval
        if (processingIntervalRef.current) {
            clearInterval(processingIntervalRef.current);
        }

        // Start new interval
        processingIntervalRef.current = setInterval(() => {
            simulateJobProcessing();

            // Update stats
            setQueueStats(prev => {
                const currentJobs = jobs.filter(job =>
                    job.status === 'Queued' || job.status === 'Processing' || job.status === 'Paused'
                );
                const completedJobs = jobs.filter(job => job.status === 'Completed');
                const failedJobs = jobs.filter(job => job.status === 'Failed');

                return {
                    queue: currentJobs.length,
                    totalJobs: jobs.length,
                    completed: completedJobs.length,
                    failed: failedJobs.length
                };
            });
        }, 1500); // Process one job every 1.5 seconds
    }, [isQueueProcessing, jobs, simulateJobProcessing]);

    useEffect(() => {
        if (isQueueProcessing) {
            startQueueProcessing();
        }

        return () => {
            if (processingIntervalRef.current) {
                clearInterval(processingIntervalRef.current);
            }
        };
    }, [isQueueProcessing, startQueueProcessing]);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Processing':
                return <Loader2 className="status-icon processing" size={14} />;
            case 'Paused':
                return <PauseCircle className="status-icon paused" size={14} />;
            case 'Completed':
                return <div className="status-dot completed"></div>;
            case 'Failed':
                return <div className="status-dot failed"></div>;
            default:
                return <div className="status-dot queued"></div>;
        }
    };

    return (
        <div className="queue-management-panel">
            <div className="queue-header">
                <button className="generate-jobs-btn" onClick={generateTestJobs} >
                    Generate 20 Test Jobs
                </button>

                <div className="queue-stats">
                    <div className="stat">
                        <span className="stat-label">Queue:</span>
                        <span className="stat-value">{queueStats.queue}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Total Jobs:</span>
                        <span className="stat-value">{queueStats.totalJobs}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Completed:</span>
                        <span className="stat-value">{queueStats.completed}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Failed:</span>
                        <span className="stat-value">{queueStats.failed}</span>
                    </div>
                </div>
            </div>

            <div className="queue-controls">
                <button
                    className="control-btn stop-btn"
                    onClick={stopJobs}
                >
                    <StopCircle size={18} />
                    Stop Jobs
                </button>
                <button
                    className="control-btn clear-btn"
                    onClick={clearQueue}
                >
                    <XCircle size={18} />
                    Clear Queue
                </button>
            </div>

            <div className="jobs-table-container">
                <table className="jobs-table">
                    <thead>
                        <tr>
                            <th>Job #</th>
                            <th>Queue</th>
                            <th>Just now</th>
                        </tr>
                    </thead>
                    <tbody>
                        {jobs.map((job) => (
                            <tr key={job.id} className="job-row">
                                <td className="job-id">Job #{job.id}</td>
                                <td className="job-status">
                                    <div className="status-cell">
                                        {getStatusIcon(job.status)}
                                        <span className="status-text">{job.status}</span>
                                    </div>
                                </td>
                                <td className="job-timestamp">{job.timestamp}</td>
                                <td className="job-actions">
                                    {job.status === 'Queued' || job.status === 'Processing' ? (
                                        <>
                                            <button
                                                className="icon-btn pause-btn"
                                                onClick={() => pauseJob(job.id)}
                                                title="Pause job"
                                            >
                                                <PauseCircle size={16} />
                                            </button>
                                            <button
                                                className="icon-btn cancel-btn"
                                                onClick={() => cancelJob(job.id)}
                                                title="Cancel job"
                                            >
                                                <XCircle size={16} />
                                            </button>
                                        </>
                                    ) : job.status === 'Paused' ? (
                                        <button
                                            className="icon-btn resume-btn"
                                            onClick={() => {
                                                setJobs(prev => prev.map(j =>
                                                    j.id === job.id ? { ...j, status: 'Queued' } : j
                                                ));
                                            }}
                                            title="Resume job"
                                        >
                                            <PlayCircle size={16} />
                                        </button>
                                    ) : null}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="queue-progress">
                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{
                            width: `${((queueStats.completed + queueStats.failed) / queueStats.totalJobs * 100) || 0}%`
                        }}
                    ></div>
                </div>
                <div className="progress-label">
                    {queueStats.completed + queueStats.failed} / {queueStats.totalJobs} jobs processed
                </div>
            </div>

            <div className="auto-refresh-toggle">
                <label>
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    Autorefresh health info (every 5s)
                </label>
            </div>
        </div>
    );
};

export default QueueManagementPanel;