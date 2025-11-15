/**
 * @fileoverview Site Audit API endpoint for Vercel Serverless Functions
 * @module api/site-audit
 */

import {
  startSiteAudit,
  checkSiteAuditStatus,
  getSiteAuditResults,
  getAllSiteAuditTasks,
  getSiteAuditTasksForUrl,
  getSiteAuditTasksByDateRange
} from '../services/dataforseo-service.js';

// Simple in-memory cache for task IDs (will be reset on server restart)
const TASK_CACHE = {};

import logging from '../utils/logging.cjs.js';
const { withLogging } = logging;

async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Check for DataForSEO credentials
    if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
      console.error('Missing DataForSEO credentials');
      return res.status(500).json({
        error: 'Server configuration error: Missing API credentials'
      });
    }

    // Handle different HTTP methods
    if (req.method === 'POST') {
      // Start a new site audit
      return handleStartAudit(req, res);
    } else if (req.method === 'GET') {
      // Check status or get results
      const { action, taskId: encodedTaskId, url: encodedUrl } = req.query;

      // Decode the taskId and url parameters
      const taskId = encodedTaskId ? decodeURIComponent(encodedTaskId) : null;
      const url = encodedUrl ? decodeURIComponent(encodedUrl) : null;

      console.log('Decoded parameters:', { action, taskId, url });

      if (action === 'status' && taskId) {
        return handleCheckStatus(req, res, taskId);
      } else if (action === 'results' && taskId) {
        return handleGetResults(req, res, taskId);
      } else if (action === 'cached' && url) {
        return handleGetCached(req, res, url);
      } else if (action === 'tasks') {
        return handleGetAllTasks(req, res);
      } else if (action === 'tasks-for-url' && url) {
        return handleGetTasksForUrl(req, res, url);
      } else {
        return res.status(400).json({
          error: 'Invalid request. Required parameters missing.',
          requiredParams: {
            status: ['action=status', 'taskId'],
            results: ['action=results', 'taskId'],
            cached: ['action=cached', 'url'],
            tasks: ['action=tasks'],
            tasksForUrl: ['action=tasks-for-url', 'url']
          }
        });
      }
    } else {
      return res.status(405).json({
        error: 'Method not allowed',
        allowedMethods: ['GET', 'POST', 'OPTIONS']
      });
    }
  } catch (error) {
    console.error('Site Audit API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * Handles starting a new site audit
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>}
 */
async function handleStartAudit(req, res) {
  try {
    // Validate request body
    const { url, options } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'Missing required parameter: url'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid URL format'
      });
    }

    // Check if we have a cached task for this URL
    if (TASK_CACHE[url]) {
      const cachedTask = TASK_CACHE[url];

      // Check if the cached task is still valid (less than 24 hours old)
      const taskAge = Date.now() - new Date(cachedTask.timestamp).getTime();
      const isTaskValid = taskAge < 24 * 60 * 60 * 1000; // 24 hours

      if (isTaskValid) {
        // Check the status of the cached task
        const statusResult = await checkSiteAuditStatus(cachedTask.taskId);

        // If the task is ready or in progress, return the cached task info
        if (statusResult.status !== 'not_found') {
          console.log(`Using cached task for URL: ${url}`, {
            taskId: cachedTask.taskId,
            age: `${Math.round(taskAge / (60 * 1000))} minutes`
          });

          return res.status(200).json({
            message: 'Using existing audit task',
            taskId: cachedTask.taskId,
            status: statusResult.status,
            isReady: statusResult.isReady,
            progress: statusResult.progress,
            url: url,
            cached: true,
            timestamp: cachedTask.timestamp
          });
        }
      }

      // If we get here, the cached task is invalid or not found
      console.log(`Cached task for URL ${url} is invalid or expired, starting new audit`);
    }

    // Start a new site audit
    console.log(`Starting new site audit for URL: ${url}`);
    const result = await startSiteAudit(url, options);

    // Cache the task ID for this URL
    TASK_CACHE[url] = {
      taskId: result.taskId,
      timestamp: result.timestamp
    };

    // Return the result
    return res.status(200).json({
      message: 'Site audit started successfully',
      ...result,
      cached: false
    });
  } catch (error) {
    console.error('Error starting site audit:', error);
    return res.status(500).json({
      error: 'Failed to start site audit',
      message: error.message
    });
  }
}

/**
 * Handles checking the status of a site audit
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {string} taskId - The task ID to check
 * @returns {Promise<void>}
 */
async function handleCheckStatus(req, res, taskId) {
  try {
    console.log(`Checking status for task ID: ${taskId}`);

    // Check if this is a URL instead of a taskId (common mistake)
    if (taskId.includes('http') || taskId.includes('www.')) {
      console.log(`Received URL instead of taskId: ${taskId}`);
      return res.status(400).json({
        error: 'Invalid taskId format. You provided a URL instead of a taskId.',
        message: 'Please use the taskId returned when starting the audit.'
      });
    }

    // Check if the taskId matches the expected format
    const taskIdRegex = /^\d{8}-\d{4}-\d{4}-\d{4}-[a-f0-9]{12}$/;
    if (!taskIdRegex.test(taskId)) {
      console.log(`Invalid taskId format: ${taskId}`);
      return res.status(400).json({
        error: 'Invalid taskId format',
        message: 'The taskId should match the format: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
      });
    }

    const result = await checkSiteAuditStatus(taskId);

    // Log the actual taskId from the result to see if it matches
    console.log(`Status check result for ${taskId}:`, {
      returnedTaskId: result.taskId,
      status: result.status,
      isReady: result.isReady
    });

    // Ensure we're returning the original taskId, not a new one
    const response = {
      message: 'Site audit status retrieved successfully',
      taskId: taskId, // Use the original taskId
      status: result.status,
      isReady: result.isReady,
      timestamp: result.timestamp
    };

    // Add progress if available
    if (result.progress !== undefined) {
      response.progress = result.progress;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error checking site audit status:', error);
    return res.status(500).json({
      error: 'Failed to check site audit status',
      message: error.message
    });
  }
}

/**
 * Handles getting the results of a site audit
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {string} taskId - The task ID to get results for
 * @returns {Promise<void>}
 */
async function handleGetResults(req, res, taskId) {
  try {
    console.log(`Getting results for task ID: ${taskId}`);

    // First check if the task is ready
    let statusResult;
    try {
      statusResult = await checkSiteAuditStatus(taskId);
      console.log('Status check result:', statusResult);

      if (!statusResult.isReady) {
        return res.status(202).json({
          message: 'Site audit is still in progress',
          ...statusResult
        });
      }
    } catch (statusError) {
      console.error('Error checking task status:', statusError);

      // If the task doesn't exist, return a 404
      if (statusError.message && statusError.message.includes('not found')) {
        return res.status(404).json({
          error: 'Task not found',
          message: statusError.message
        });
      }

      throw statusError;
    }

    // Get the results from DataForSEO
    try {
      console.log('Fetching full results for task:', taskId);
      const results = await getSiteAuditResults(taskId);
      console.log('Results retrieved successfully, summary:', {
        crawledPages: results.summary?.crawledPages,
        totalIssues: (results.summary?.totalErrors || 0) + (results.summary?.totalWarnings || 0)
      });

      // Return the results
      return res.status(200).json({
        message: 'Site audit results retrieved successfully',
        ...results
      });
    } catch (resultsError) {
      console.error('Error getting results:', resultsError);

      // Try to get at least the summary data
      try {
        console.log('Attempting to get summary data only...');
        const { dataForSeoClient, BASE_URLS } = require('../services/dataforseo-service');

        const summaryResponse = await dataForSeoClient.get(
          `${BASE_URLS.onPage}/summary`,
          {
            params: {
              id: taskId
            }
          }
        );

        if (summaryResponse.data && summaryResponse.data.tasks && summaryResponse.data.tasks.length > 0) {
          const summary = summaryResponse.data.tasks[0].result[0] || {};

          return res.status(200).json({
            message: 'Site audit summary retrieved (full results unavailable)',
            summary: {
              crawlStatus: summary.crawl_status || 'unknown',
              crawledPages: summary.crawled_pages || 0,
              totalPages: summary.total_pages || 0,
              totalErrors: summary.total_errors || 0,
              totalWarnings: summary.total_warnings || 0,
              score: summary.onpage_score || 0
            },
            error: resultsError.message
          });
        }
      } catch (summaryError) {
        console.error('Failed to get even summary data:', summaryError);
      }

      // If we get here, both full results and summary failed
      throw resultsError;
    }
  } catch (error) {
    console.error('Error in handleGetResults:', error);

    // Determine appropriate status code
    const statusCode = error.response?.status || 500;

    return res.status(statusCode).json({
      error: 'Failed to get site audit results',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        response: error.response?.data
      } : undefined
    });
  }
}

/**
 * Handles getting cached results for a URL
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {string} url - The URL to get cached results for
 * @returns {Promise<void>}
 */
async function handleGetCached(req, res, url) {
  try {
    console.log(`Checking for cached results for URL: ${url}`);

    // Check if we have a cached task for this URL
    if (!TASK_CACHE[url]) {
      return res.status(404).json({
        error: 'No cached audit found for this URL',
        url: url
      });
    }

    const cachedTask = TASK_CACHE[url];

    // Check if the cached task is still valid (less than 24 hours old)
    const taskAge = Date.now() - new Date(cachedTask.timestamp).getTime();
    const isTaskValid = taskAge < 24 * 60 * 60 * 1000; // 24 hours

    if (!isTaskValid) {
      // Remove the invalid cache entry
      delete TASK_CACHE[url];

      return res.status(404).json({
        error: 'Cached audit has expired',
        url: url
      });
    }

    // Check the status of the cached task
    const statusResult = await checkSiteAuditStatus(cachedTask.taskId);

    if (statusResult.status === 'not_found') {
      // Remove the invalid cache entry
      delete TASK_CACHE[url];

      return res.status(404).json({
        error: 'Cached audit task no longer exists',
        url: url
      });
    }

    // If the task is not ready, return the status
    if (!statusResult.isReady) {
      return res.status(202).json({
        message: 'Cached site audit is still in progress',
        taskId: cachedTask.taskId,
        url: url,
        ...statusResult
      });
    }

    // Get the results
    const results = await getSiteAuditResults(cachedTask.taskId);

    // Refresh the timestamp
    TASK_CACHE[url].timestamp = new Date().toISOString();

    return res.status(200).json({
      message: 'Cached site audit results retrieved successfully',
      taskId: cachedTask.taskId,
      url: url,
      cached: true,
      cacheAge: `${Math.round(taskAge / (60 * 1000))} minutes`,
      ...results
    });
  } catch (error) {
    console.error('Error getting cached site audit:', error);
    return res.status(500).json({
      error: 'Failed to get cached site audit',
      message: error.message
    });
  }
}

/**
 * Handles getting all site audit tasks
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>}
 */
async function handleGetAllTasks(req, res) {
  try {
    console.log('Getting all site audit tasks');

    // Parse options from query parameters
    const options = {
      limit: parseInt(req.query.limit) || 100,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      includeCompleted: req.query.includeCompleted !== 'false',
      includePending: req.query.includePending !== 'false'
    };

    console.log('Task list options:', options);

    // If dateFrom and dateTo are provided, use the date range function
    if (options.dateFrom && options.dateTo) {
      console.log(`Using date range: ${options.dateFrom} to ${options.dateTo}`);
      const result = await getSiteAuditTasksByDateRange(options.dateFrom, options.dateTo, options);

      return res.status(200).json({
        message: `Site audit tasks retrieved for date range: ${options.dateFrom} to ${options.dateTo}`,
        ...result
      });
    }

    // Otherwise, get all tasks
    const result = await getAllSiteAuditTasks(options);

    return res.status(200).json({
      message: 'Site audit tasks retrieved successfully',
      ...result
    });
  } catch (error) {
    console.error('Error getting site audit tasks:', error);
    return res.status(500).json({
      error: 'Failed to get site audit tasks',
      message: error.message
    });
  }
}

/**
 * Handles getting site audit tasks for a specific URL
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {string} url - The URL to get tasks for
 * @returns {Promise<void>}
 */
async function handleGetTasksForUrl(req, res, url) {
  try {
    console.log(`Getting site audit tasks for URL: ${url}`);

    // Parse options from query parameters
    const options = {
      limit: parseInt(req.query.limit) || 100,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      includeCompleted: req.query.includeCompleted !== 'false',
      includePending: req.query.includePending !== 'false'
    };

    // Get tasks for the URL
    const result = await getSiteAuditTasksForUrl(url, options);

    return res.status(200).json({
      message: 'Site audit tasks for URL retrieved successfully',
      ...result
    });
  } catch (error) {
    console.error('Error getting site audit tasks for URL:', error);
    return res.status(500).json({
      error: 'Failed to get site audit tasks for URL',
      message: error.message
    });
  }
}

export default withLogging(handler);
