const readline = require('readline');
const { generateLicenseKey, calculateExpiry } = require('./license-manager');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('==============================================================');
  console.log('      CAR4RENT SOFTWARE LICENSE KEY GENERATOR (PRIVATE)      ');
  console.log('  * IMPORTANT: Keep this generator on your local PC only! *  ');
  console.log('==============================================================\n');

  let domain = (process.argv[2] || '').trim();
  if (!domain) {
    domain = await ask('Enter Target Domain (e.g. clientcarrental.com or localhost): ');
  }
  domain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(':')[0].replace(/\/.*$/, '');
  if (!domain) {
    console.error('Error: Domain cannot be empty!');
    rl.close();
    return;
  }

  let durationChoice = (process.argv[3] || '').trim();
  if (!durationChoice) {
    console.log('\nSelect License Duration:');
    console.log('  [1] 3 Months (90 Days)');
    console.log('  [2] 6 Months (180 Days)');
    console.log('  [3] 1 Year   (365 Days)');
    console.log('  [4] Lifetime (Unlimited)');
    durationChoice = await ask('\nEnter choice [1-4] (Default: 3): ');
  }

  let durationType = '1_year';
  if (durationChoice === '1' || durationChoice === '3_months') durationType = '3_months';
  else if (durationChoice === '2' || durationChoice === '6_months') durationType = '6_months';
  else if (durationChoice === '4' || durationChoice === 'lifetime') durationType = 'lifetime';

  const expiry = calculateExpiry(durationType);
  const key = generateLicenseKey(domain, durationType, expiry);

  console.log('\n==============================================================');
  console.log('  SUCCESS! NEW ACTIVATION KEY GENERATED:');
  console.log('==============================================================');
  console.log(`  Registered Domain: ${domain}`);
  console.log(`  Duration Plan:     ${durationType.toUpperCase().replace('_', ' ')}`);
  console.log(`  Expiration Date:   ${expiry}`);
  console.log('--------------------------------------------------------------');
  console.log('  ACTIVATION KEY:');
  console.log(`\n  ${key}\n`);
  console.log('--------------------------------------------------------------');
  console.log('  Instructions:');
  console.log('  1. Give this key to the client for their domain: ' + domain);
  console.log('  2. Client enters this key on the website activation screen.');
  console.log('  3. This key WILL NOT work on any other domain!');
  console.log('==============================================================\n');

  rl.close();
}

main();
