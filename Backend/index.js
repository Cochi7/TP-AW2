import express from 'express'
import dotenv from 'dotenv'
import { readFile, writeFile } from 'fs/promises'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_muy_segura_cambiar_en_produccion'

// ===== MIDDLEWARE CORS =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

app.use(express.json())

app.listen(port, () => {
  console.log(`Servidor levantado en puerto ${port}`)
})

// === CARGA DE DATOS ===
const products = JSON.parse(await readFile('./data/products.json', 'utf-8'))
const users = JSON.parse(await readFile('./data/users.json', 'utf-8'))
const sales = JSON.parse(await readFile('./data/sales.json', 'utf-8'))

// ===== MIDDLEWARE DE AUTENTICACIÓN =====
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' })
    }
    req.user = user
    next()
  })
}

// === RUTAS PÚBLICAS ===

// GET: obtener todos los productos
app.get('/products', (req, res) => {
  res.status(200).json(products)
})

// GET: obtener un producto por id
app.get('/products/:id', (req, res) => {
  const product = products.find(p => p.id == req.params.id)
  product
    ? res.status(200).json(product)
    : res.status(404).json({ error: 'Producto no encontrado' })
})

// GET: obtener todas las categorías únicas
app.get('/categories', (req, res) => {
  const categories = [...new Set(products.map(p => p.category))]
  res.status(200).json(categories)
})

// POST: Registro de usuario
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body

    // Validar datos requeridos
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' })
    }

    // Verificar si el email ya existe
    const existingUser = users.find(u => u.email === email)
    if (existingUser) {
      return res.status(400).json({ error: 'El email ya está registrado' })
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10)

    // Crear nuevo usuario
    const newUser = {
      id: users.length + 1,
      name,
      email,
      password: hashedPassword,
      phone: phone || '',
      address: address || '',
      role: 'customer'
    }

    users.push(newUser)
    await writeFile('./data/users.json', JSON.stringify(users, null, 2))

    // Generar token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    // No enviar la contraseña en la respuesta
    const { password: _, ...userWithoutPassword } = newUser

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: userWithoutPassword,
      token
    })
  } catch (error) {
    console.error('Error en registro:', error)
    res.status(500).json({ error: 'Error al registrar usuario' })
  }
})

// POST: Login de usuario
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Validar datos
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' })
    }

    // Buscar usuario
    const user = users.find(u => u.email === email)
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    // Generar token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    // No enviar la contraseña en la respuesta
    const { password: _, ...userWithoutPassword } = user

    res.status(200).json({
      message: 'Login exitoso',
      user: userWithoutPassword,
      token
    })
  } catch (error) {
    console.error('Error en login:', error)
    res.status(500).json({ error: 'Error al iniciar sesión' })
  }
})

// === RUTAS PROTEGIDAS (Requieren autenticación) ===

// POST: crear orden de compra (PROTEGIDA)
app.post('/orders', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body
    const userId = req.user.id // ID del usuario autenticado

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' })
    }

    // Buscar usuario autenticado
    const currentUser = users.find(u => u.id === userId)
    if (!currentUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const newSales = []
    let orderTotal = 0

    for (const item of items) {
      const product = products.find(p => p.id === item.id)
      
      if (!product) {
        return res.status(400).json({ error: `Producto ${item.id} no encontrado` })
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ 
          error: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}` 
        })
      }

      const saleTotal = product.price * item.quantity

      const newSale = {
        id: sales.length + newSales.length + 1,
        userId: currentUser.id,
        productId: product.id,
        quantity: item.quantity,
        total: saleTotal,
        date: new Date().toISOString(),
      }

      newSales.push(newSale)
      orderTotal += saleTotal
      product.stock -= item.quantity
    }

    sales.push(...newSales)
    await writeFile('./data/sales.json', JSON.stringify(sales, null, 2))
    await writeFile('./data/products.json', JSON.stringify(products, null, 2))

    res.status(201).json({ 
      message: 'Orden creada exitosamente',
      order: {
        id: newSales[0].id,
        userId: currentUser.id,
        userName: currentUser.name,
        items: newSales,
        total: orderTotal,
        date: newSales[0].date
      }
    })
  } catch (error) {
    console.error('Error en orden:', error)
    res.status(500).json({ error: 'Error al crear la orden' })
  }
})

// GET: obtener historial de compras del usuario (PROTEGIDA)
app.get('/orders/my-orders', authenticateToken, (req, res) => {
  const userId = req.user.id
  const userSales = sales.filter(s => s.userId === userId)
  
  // Enriquecer con información de productos
  const enrichedSales = userSales.map(sale => {
    const product = products.find(p => p.id === sale.productId)
    return {
      ...sale,
      productName: product ? product.name : 'Producto no encontrado',
      productImage: product ? product.image : null
    }
  })

  res.status(200).json(enrichedSales)
})

// GET: obtener perfil del usuario (PROTEGIDA)
app.get('/auth/profile', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id)
  
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  const { password: _, ...userWithoutPassword } = user
  res.status(200).json(userWithoutPassword)
})

// PUT: actualizar perfil del usuario (PROTEGIDA)
app.put('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { name, phone, address } = req.body
    const userId = req.user.id

    const userIndex = users.findIndex(u => u.id === userId)
    if (userIndex === -1) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    // Actualizar solo los campos proporcionados
    if (name) users[userIndex].name = name
    if (phone) users[userIndex].phone = phone
    if (address) users[userIndex].address = address

    await writeFile('./data/users.json', JSON.stringify(users, null, 2))

    const { password: _, ...userWithoutPassword } = users[userIndex]
    res.status(200).json({
      message: 'Perfil actualizado',
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('Error actualizando perfil:', error)
    res.status(500).json({ error: 'Error al actualizar perfil' })
  }
})

// === RUTAS ADMINISTRATIVAS (Solo para admin) ===

// Middleware para verificar rol de admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador' })
  }
  next()
}

// PUT: actualizar precio de un producto (ADMIN)
app.put('/products/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params
  const { price } = req.body
  const index = products.findIndex(p => p.id == id)

  if (index === -1) {
    return res.status(404).json({ error: 'Producto no encontrado' })
  }

  products[index].price = price
  await writeFile('./data/products.json', JSON.stringify(products, null, 2))
  res.status(200).json({ message: 'Precio actualizado', product: products[index] })
})

// DELETE: eliminar usuario (ADMIN)
app.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params
  const userSales = sales.filter(s => s.userId == id)

  if (userSales.length > 0) {
    return res.status(400).json({ error: 'No se puede eliminar el usuario con ventas registradas' })
  }

  const index = users.findIndex(u => u.id == id)
  if (index === -1) {
    return res.status(404).json({ error: 'Usuario no encontrado' })
  }

  users.splice(index, 1)
  await writeFile('./data/users.json', JSON.stringify(users, null, 2))
  res.status(200).json({ message: 'Usuario eliminado correctamente' })
})

// GET: obtener todas las ventas (ADMIN)
app.get('/sales', authenticateToken, isAdmin, (req, res) => {
  res.status(200).json(sales)
})

// === RUTA DE PRUEBA ===
app.get('/', (req, res) => {
  res.json({ 
    message: 'API E-commerce TechStore',
    version: '2.0',
    endpoints: {
      public: ['/products', '/categories', '/auth/login', '/auth/register'],
      protected: ['/orders', '/orders/my-orders', '/auth/profile'],
      admin: ['/sales', '/users/:id', '/products/:id']
    }
  })
})