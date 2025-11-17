import bcrypt from 'bcrypt'

const generateHash = async (password) => {
  const hash = await bcrypt.hash(password, 10)
  console.log(`Password: ${password}`)
  console.log(`Hash: ${hash}`)
  console.log('---')
}

const main = async () => {
  console.log('Generando hashes de contraseñas...\n')
  
  await generateHash('admin123')
  await generateHash('password123')
  await generateHash('test123')
  
  console.log('\nCopia estos hashes y pégalos en users.json')
}

main()