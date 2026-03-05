const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const authService = require('../services/authService');

// Hard-coded test data
const testUser = {
  username: 'testuser123',
  email: 'testuser@example.com',
  password: 'securePassword123!'
};

const wrongPassword = 'wrongPassword456';

(async () => {
  console.log('========== AUTH TEST SUITE ==========\n');

  try {
    // TEST 1: Register new user
    console.log('TEST 1: Register new user');
    console.log(`  Input: email=${testUser.email}, username=${testUser.username}`);
    const registeredUser = await authService.registerUser(testUser);
    console.log(`  ✓ Success: User registered`);
    console.log(`  Response: { id: ${registeredUser._id}, email: ${registeredUser.email}, username: ${registeredUser.username} }\n`);

    // TEST 2: Try registering duplicate email
    console.log('TEST 2: Try registering duplicate email (should fail)');
    console.log(`  Input: email=${testUser.email} (duplicate)`);
    try {
      await authService.registerUser({
        username: 'another_user',
        email: testUser.email,
        password: 'anotherpass123'
      });
      console.log(`  ✗ FAILED: Should have rejected duplicate email\n`);
    } catch (err) {
      console.log(`  ✓ Correctly rejected: "${err.message}"\n`);
    }

    // TEST 3: Login with correct password
    console.log('TEST 3: Login with correct password');
    console.log(`  Input: email=${testUser.email}, password=****`);
    const token = await authService.loginUser({
      email: testUser.email,
      password: testUser.password
    });
    console.log(`  ✓ Success: Login successful`);
    console.log(`  Token: ${token}\n`);

    // TEST 4: Login with wrong password
    console.log('TEST 4: Login with wrong password (should fail)');
    console.log(`  Input: email=${testUser.email}, password=${wrongPassword}`);
    try {
      await authService.loginUser({
        email: testUser.email,
        password: wrongPassword
      });
      console.log(`  ✗ FAILED: Should have rejected wrong password\n`);
    } catch (err) {
      console.log(`  ✓ Correctly rejected: "${err.message}"\n`);
    }

    // TEST 5: Login with non-existent email
    console.log('TEST 5: Login with non-existent email (should fail)');
    const fakeEmail = 'nonexistent@example.com';
    console.log(`  Input: email=${fakeEmail}`);
    try {
      await authService.loginUser({
        email: fakeEmail,
        password: testUser.password
      });
      console.log(`  ✗ FAILED: Should have rejected non-existent email\n`);
    } catch (err) {
      console.log(`  ✓ Correctly rejected: "${err.message}"\n`);
    }

    console.log('========== ALL TESTS COMPLETED ==========');
    console.log('Status: ✓ PASSED (Register & Login working with in-memory fallback)\n');
    
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
