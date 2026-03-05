require('./config/db')(); // kết nối SQL trước

const authService = require('./src/services/authService');

(async () => {
  try {
    console.log;

    // Register
    const user = await authService.register({
      username: 'localtest',
      email: 'local@test.com',
      password: 'password123'
    });

    console.log('✅ Registered:', user);

    // Login
    const data = await authService.login({
      email: 'local@test.com',
      password: 'password123'
    });

    console.log('✅ Login token:', data.token);

  } catch (err) {
    console.error('❌ Test error:', err.message);
  }
})();