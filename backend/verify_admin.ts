import 'dotenv/config'
import { query } from './src/db'

async function verify() {
  try {
    const result = await query(`
      SELECT 
        u.user_id,
        u.username,
        u.email,
        u.first_name,
        u.last_name,
        r.role_name
      FROM app_user u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id
      WHERE u.email = 'admin@itsm.com'
    `)
    
    console.log('Admin User Details:')
    console.log(JSON.stringify(result, null, 2))
    
    if (result.length > 0 && result[0].role_name === 'ADMIN') {
      console.log('\n✅ admin@itsm.com is already configured as ADMIN')
    }
    process.exit(0)
  } catch (err: any) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

verify()
