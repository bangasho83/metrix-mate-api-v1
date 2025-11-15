/**
 * Debug script to check contracts for a specific customer
 * Run with: node scripts/debug-contracts.js CUSTOMER_ID
 */

const metronomeService = require('../services/metronome-service');

async function debugContracts(customerId) {
  if (!customerId) {
    console.error('Usage: node scripts/debug-contracts.js CUSTOMER_ID');
    console.error('Example: node scripts/debug-contracts.js d1102212-1a66-4965-b883-2bb6e677ddff');
    process.exit(1);
  }

  console.log('🔍 Debugging contracts for customer:', customerId);
  console.log('=====================================\n');

  try {
    // Get all contracts for the customer
    const contractsResult = await metronomeService.listContracts(customerId);

    if (!contractsResult.success) {
      console.error('❌ Failed to fetch contracts:', contractsResult.error);
      return;
    }

    const contracts = contractsResult.contracts;
    console.log(`📋 Found ${contracts.length} contract(s):\n`);

    contracts.forEach((contract, index) => {
      console.log(`Contract ${index + 1}:`);
      console.log(`  ID: ${contract.id}`);
      console.log(`  Starting at: ${contract.starting_at}`);
      console.log(`  Ending before: ${contract.ending_before}`);
      console.log(`  Has transition: ${!!contract.transition}`);
      
      if (contract.transition) {
        console.log(`  Transition type: ${contract.transition.type}`);
        console.log(`  Transition from: ${contract.transition.from_contract_id}`);
        console.log(`  Transition to: ${contract.transition.to_contract_id || 'N/A'}`);
      }
      
      if (contract.recurring_commits && contract.recurring_commits.length > 0) {
        console.log(`  Recurring commits: ${contract.recurring_commits.length}`);
        contract.recurring_commits.forEach((commit, i) => {
          console.log(`    Commit ${i + 1}: ${commit.access_amount?.unit_price || 'N/A'} cents`);
        });
      }
      
      if (contract.credits && contract.credits.length > 0) {
        console.log(`  Credits: ${contract.credits.length}`);
        contract.credits.forEach((credit, i) => {
          console.log(`    Credit ${i + 1}: ${credit.name || 'N/A'}`);
        });
      }
      
      console.log('');
    });

    // Determine which contract should be used for top-up
    console.log('🎯 Contract Selection Analysis:');
    console.log('================================');
    
    const activeContracts = contracts.filter(c => !c.transition);
    const transitionedContracts = contracts.filter(c => !!c.transition);
    
    console.log(`Active contracts (no transition): ${activeContracts.length}`);
    console.log(`Transitioned contracts: ${transitionedContracts.length}`);
    
    if (activeContracts.length > 0) {
      const sortedActive = [...activeContracts].sort((a, b) => {
        return new Date(b.starting_at) - new Date(a.starting_at);
      });
      console.log(`✅ Recommended contract for top-up: ${sortedActive[0].id}`);
      console.log(`   Starting at: ${sortedActive[0].starting_at}`);
    } else {
      console.log('❌ No active contracts found - all are transitioned');
    }

  } catch (error) {
    console.error('❌ Error debugging contracts:', error.message);
  }
}

// Get customer ID from command line arguments
const customerId = process.argv[2];
debugContracts(customerId);
