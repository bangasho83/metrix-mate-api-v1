/**
 * Metronome Configuration Constants
 *
 * ⚡ SINGLE SOURCE OF TRUTH for all Metronome billing settings
 *
 * 🔧 TO UPDATE CONFIGURATION:
 * 1. Edit the values below directly, OR
 * 2. Set environment variables (they override the values below)
 *
 * 🌍 Environment Variable Overrides:
 * - METRONOME_RATE_CARD_ID
 * - METRONOME_PRODUCT_ID
 * - METRONOME_ACCESS_CREDIT_TYPE_ID
 * - METRONOME_INVOICE_CREDIT_TYPE_ID
 * - METRONOME_FREE_TRIAL_CREDITS
 * - METRONOME_FREE_TRIAL_DURATION_YEARS
 * - METRONOME_TOPUP_CREDITS_PER_CENT
 * - METRONOME_API_TIMEOUT
 *
 * @fileoverview Metronome billing system configuration constants
 */

// API Configuration
const METRONOME_API_URL = 'https://api.metronome.com/v1';
const METRONOME_API_V2_URL = 'https://api.metronome.com/v2';

// 🆔 Core Metronome IDs - EDIT THESE VALUES TO UPDATE YOUR CONFIGURATION
const METRONOME_IDS = {
  // Rate Cards
  RATE_CARD_ID: process.env.METRONOME_RATE_CARD_ID || 'b3a5b063-ecc7-4887-950b-4a8be9c331a6',

  // Products
  PRODUCT_ID: process.env.METRONOME_PRODUCT_ID || '4983cc7c-30b6-4355-a07a-9d5afd99d1a6',
  TOPUP_PRODUCT_ID: process.env.METRONOME_TOPUP_PRODUCT_ID || '9a4e2b58-14af-46b3-97ff-afdc98da8324',

  // Credit Types
  CREDIT_TYPE_ID: process.env.METRONOME_CREDIT_TYPE_ID || '12c05d6b-f2f0-49ec-889a-ddabf26f27ab',
  INVOICE_CREDIT_TYPE_ID: process.env.METRONOME_INVOICE_CREDIT_TYPE_ID || '2714e483-4ff1-48e4-9e25-ac732e8f24f2',
};

// 🎁 Free Trial Configuration - EDIT THESE VALUES TO UPDATE FREE TRIAL SETTINGS
const FREE_TRIAL_CONFIG = {
  CREDITS: parseInt(process.env.METRONOME_FREE_TRIAL_CREDITS) || 500,
  DURATION_YEARS: parseFloat(process.env.METRONOME_FREE_TRIAL_DURATION_YEARS) || 1,
  PRIORITY: 1,
  NAME: 'Free Trial Credits'
};

// 💳 Top-up Configuration - EDIT THESE VALUES TO UPDATE TOP-UP SETTINGS
const TOPUP_CONFIG = {
  CREDITS_PER_CENT: parseFloat(process.env.METRONOME_TOPUP_CREDITS_PER_CENT) || 2, // 2 credits per cent ($1 = 200 credits)
  PRIORITY: 2,
  NAME: 'Top Up Credits',
  PAYMENT_GATE_TYPE: 'STRIPE',
  PAYMENT_TYPE: 'PAYMENT_INTENT'
};

// ⏱️ API Timeouts - EDIT THESE VALUES TO UPDATE TIMEOUT SETTINGS
const TIMEOUTS = {
  DEFAULT: parseInt(process.env.METRONOME_API_TIMEOUT) || 30000, // 30 seconds
  SHORT: 10000,   // 10 seconds
  LONG: 60000     // 60 seconds
};

// Date Utilities for Metronome (requires hour boundaries)
const createHourBoundaryDate = (date = new Date()) => {
  const boundaryDate = new Date(date);
  boundaryDate.setMinutes(0, 0, 0); // Set to hour boundary
  return boundaryDate;
};

const createTrialEndDate = (startDate = new Date()) => {
  const endDate = createHourBoundaryDate(startDate);
  endDate.setFullYear(endDate.getFullYear() + FREE_TRIAL_CONFIG.DURATION_YEARS);
  return endDate;
};

const createTopupEndDate = (startDate = new Date()) => {
  const endDate = createHourBoundaryDate(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1); // 1 year validity
  return endDate;
};

// Validation helpers
const validateCustomerId = (customerId) => {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('Missing or invalid required parameter: customer_id');
  }
  return customerId;
};

const validateContractId = (contractId) => {
  if (!contractId || typeof contractId !== 'string') {
    throw new Error('Missing or invalid required parameter: contract_id');
  }
  return contractId;
};

const validateCredits = (credits) => {
  if (typeof credits !== 'number' || credits <= 0) {
    throw new Error('Credits must be a positive number');
  }
  return credits;
};

// Export all constants and utilities
module.exports = {
  // API URLs
  METRONOME_API_URL,
  METRONOME_API_V2_URL,
  
  // Core IDs
  METRONOME_IDS,
  
  // Configuration
  FREE_TRIAL_CONFIG,
  TOPUP_CONFIG,
  TIMEOUTS,
  
  // Date utilities
  createHourBoundaryDate,
  createTrialEndDate,
  createTopupEndDate,
  
  // Validation helpers
  validateCustomerId,
  validateContractId,
  validateCredits,
  
  // Legacy aliases for backward compatibility (DEPRECATED - use METRONOME_IDS instead)
  RATE_CARD_ID: METRONOME_IDS.RATE_CARD_ID,
  PRODUCT_ID: METRONOME_IDS.PRODUCT_ID,
  ACCESS_CREDIT_TYPE_ID: METRONOME_IDS.CREDIT_TYPE_ID,
  INVOICE_CREDIT_TYPE_ID: METRONOME_IDS.INVOICE_CREDIT_TYPE_ID
};
