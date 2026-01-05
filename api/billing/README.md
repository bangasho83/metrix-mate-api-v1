# Billing API

## Overview

The Billing API provides endpoints for managing billing and credit balance information for organizations using Metronome as the billing provider.

## Endpoints

### Get Rate Card

**Endpoint:** `GET /api/billing/rate-card`

**Description:** Retrieves the pricing rate card showing credits required for each service.

**Response:**
```json
{
  "success": true,
  "rateCard": {
    "image-gen": 25,
    "site-audit": 300,
    "html-scraper": 10,
    "keyword-sim": 100,
    "meta-ad-sim": 50,
    "image-prompt": 10,
    "calendar-sim": 200,
    "keyword-research": 5,
    "mates-take/overview": 5
  },
  "totalServices": 9,
  "description": "Each credit is USD .005 (For example 10,000 credits = USD 50)"
}
```

**Example Request:**
```bash
curl -X GET "https://social-apis-two.vercel.app/api/billing/rate-card"
```

**Example with JavaScript:**
```javascript
const response = await fetch('https://social-apis-two.vercel.app/api/billing/rate-card');
const data = await response.json();

console.log('Rate Card:', data.rateCard);
console.log('Image Gen Cost:', data.rateCard['image-gen'], 'credits');
```

### Get Balance

**Endpoint:** `GET /api/billing/balance`

**Description:** Retrieves the credit balance for an organization from Metronome.

**Query Parameters:**
- `organizationId` (required) - Firebase organization ID

**Response:**
```json
{
  "success": true,
  "organizationId": "kq8D0URspd5I7uBck8l9",
  "billing": {
    "provider": "metronome",
    "customerId": "c6330dab-5b2a-43bc-a6c4-acc576c1fbe5",
    "status": "active",
    "status_desc": "Active - 425 credits available",
    "balance": {
      "total": 425,
      "credits": [
        {
          "id": "ac615ee0-8480-42c9-bc25-f08e2efd9f65",
          "name": "Free Trial Credits",
          "balance": 425,
          "type": "CREDIT",
          "status": "active",
          "status_desc": "Active - Expires 10/9/2026",
          "product": {
            "id": "4983cc7c-30b6-4355-a07a-9d5afd99d1a6",
            "name": "Included Credits"
          },
          "schedule": {
            "amount": 500,
            "starting_at": "2025-10-09T15:00:00+00:00",
            "ending_before": "2026-10-09T15:00:00+00:00"
          },
          "created_at": "2025-10-09T15:09:36.301000+00:00"
        }
      ]
    }
  }
}
```

**Example Request:**
```bash
curl -X GET "https://social-apis-two.vercel.app/api/billing/balance?organizationId=kq8D0URspd5I7uBck8l9"
```

**Example with JavaScript:**
```javascript
const response = await fetch(
  'https://social-apis-two.vercel.app/api/billing/balance?organizationId=kq8D0URspd5I7uBck8l9'
);
const data = await response.json();

console.log('Total Balance:', data.billing.balance.total);
console.log('Credits:', data.billing.balance.credits);
```

## Status Codes

The API provides intelligent status information at both the overall account level and individual credit level.

### Overall Account Status

| Status | Description | Condition |
|--------|-------------|-----------|
| `active` | Account has available credits | Has active credits with balance > 0 |
| `active_expiring_soon` | Account active but credits expiring soon | Has active credits, some expiring within 7 days |
| `depleted` | All credits used | Total balance = 0 |
| `pending` | Credits not yet started | All credits have future start dates |
| `inactive` | Credits expired or unavailable | All credits expired or depleted |
| `no_credits` | No credits configured | No credit contracts exist |

### Individual Credit Status

| Status | Description | Example Status Description |
|--------|-------------|---------------------------|
| `active` | Credit is active and available | "Active - Expires 10/9/2026" |
| `expiring_soon` | Credit expires within 7 days | "Expiring Soon - 5 days remaining" |
| `depleted` | Credit balance is zero | "Depleted - No balance remaining" |
| `expired` | Credit end date has passed | "Expired - Ended 10/9/2025" |
| `pending` | Credit start date is in future | "Pending - Starts 10/15/2025" |

### Status Examples

**Active with plenty of time:**
```json
{
  "status": "active",
  "status_desc": "Active - 500 credits available"
}
```

**Active but expiring soon:**
```json
{
  "status": "active_expiring_soon",
  "status_desc": "Active - 425 credits (some expiring soon)"
}
```

**Individual credit expiring soon:**
```json
{
  "status": "expiring_soon",
  "status_desc": "Expiring Soon - 3 days remaining"
}
```

**Depleted credits:**
```json
{
  "status": "depleted",
  "status_desc": "Depleted - No balance remaining"
}
```

**Expired credits:**
```json
{
  "status": "expired",
  "status_desc": "Expired - Ended 10/9/2025"
}
```

**Pending credits:**
```json
{
  "status": "pending",
  "status_desc": "Pending - Starts 10/15/2025"
}
```

## Use Cases

### 1. Dashboard Widget
Display remaining credits with status indicator:
```javascript
async function displayCredits(organizationId) {
  const response = await fetch(`/api/billing/balance?organizationId=${organizationId}`);
  const data = await response.json();

  const { status, status_desc, balance } = data.billing;

  // Display credits
  document.getElementById('credits').textContent = balance.total;

  // Display status with color coding
  const statusElement = document.getElementById('status');
  statusElement.textContent = status_desc;

  // Apply status-based styling
  if (status === 'active') {
    statusElement.className = 'status-active';
  } else if (status === 'active_expiring_soon' || status === 'expiring_soon') {
    statusElement.className = 'status-warning';
  } else if (status === 'depleted' || status === 'expired') {
    statusElement.className = 'status-error';
  }
}
```

### 2. Pre-Generation Check
Check if user has enough credits and valid status:
```javascript
async function canGenerateContent(organizationId, requiredCredits = 1) {
  const response = await fetch(`/api/billing/balance?organizationId=${organizationId}`);
  const data = await response.json();

  const { status, balance } = data.billing;

  // Check if account is active and has enough credits
  if (status === 'active' || status === 'active_expiring_soon') {
    return balance.total >= requiredCredits;
  }

  // Show appropriate message based on status
  if (status === 'depleted') {
    alert('No credits remaining. Please purchase more credits.');
  } else if (status === 'expired') {
    alert('Your credits have expired. Please renew your subscription.');
  } else if (status === 'pending') {
    alert('Your credits are not yet active. Please wait until the start date.');
  }

  return false;
}
```

### 3. Billing Page
Show detailed credit breakdown with status:
```javascript
async function showBillingDetails(organizationId) {
  const response = await fetch(`/api/billing/balance?organizationId=${organizationId}`);
  const data = await response.json();

  const { status_desc, balance } = data.billing;

  // Display overall status
  console.log('Account Status:', status_desc);
  console.log('Total Credits:', balance.total);

  // Display each credit with status
  balance.credits.forEach(credit => {
    console.log(`\n${credit.name}:`);
    console.log(`  Balance: ${credit.balance} credits`);
    console.log(`  Status: ${credit.status_desc}`);

    if (credit.schedule) {
      console.log(`  Starts: ${new Date(credit.schedule.starting_at).toLocaleDateString()}`);
      console.log(`  Expires: ${new Date(credit.schedule.ending_before).toLocaleDateString()}`);
    }
  });
}
```

### 4. Status-Based Alerts
Show alerts based on credit status:
```javascript
async function checkCreditAlerts(organizationId) {
  const response = await fetch(`/api/billing/balance?organizationId=${organizationId}`);
  const data = await response.json();

  const { status, balance } = data.billing;

  // Check for expiring credits
  const expiringCredits = balance.credits.filter(c => c.status === 'expiring_soon');

  if (expiringCredits.length > 0) {
    expiringCredits.forEach(credit => {
      showNotification('warning', `${credit.name}: ${credit.status_desc}`);
    });
  }

  // Check for low balance
  if (balance.total > 0 && balance.total < 50) {
    showNotification('info', `Low balance: ${balance.total} credits remaining`);
  }

  // Check for depleted/expired
  if (status === 'depleted' || status === 'expired') {
    showNotification('error', data.billing.status_desc);
  }
}
```

## Error Responses

### 400 - Missing Parameter
```json
{
  "error": "Missing required parameter: organizationId",
  "message": "Please provide organizationId as a query parameter"
}
```

### 404 - Organization Not Found
```json
{
  "error": "Organization not found",
  "organizationId": "invalid-org-id"
}
```

### 404 - No Billing Customer
```json
{
  "error": "Billing customer not found for this organization",
  "organizationId": "kq8D0URspd5I7uBck8l9",
  "message": "This organization does not have a billing customer ID. Please contact support."
}
```

### 500 - Metronome Error
```json
{
  "error": "Failed to fetch billing balance",
  "details": "Error message from Metronome",
  "organizationId": "kq8D0URspd5I7uBck8l9"
}
```

## Flow Diagram

```
Client Request
    ↓
GET /api/billing/balance?organizationId=ORG_ID
    ↓
Fetch Organization from Firebase
    ↓
Get billingCustomerId
    ↓
Call Metronome API (getCustomerBalance)
    ↓
Format Response
    ↓
Return Balance Data
```

## Related Documentation

- [Metronome Integration Guide](../../docs/METRONOME_INTEGRATION.md)
- [Metronome Service](../../services/metronome-service.js)
- [Organizations API](../organizations.js)

## Notes

- The endpoint requires the organization to have a `billingCustomerId` in Firebase
- Organizations created via `POST /api/organizations` automatically get a billing customer
- New organizations receive 500 free trial credits valid for 1 year
- Balance data is fetched in real-time from Metronome (not cached)
- The `total` balance is the sum of all credit balances
- Credits may have expiration dates (check `schedule.ending_before`)

