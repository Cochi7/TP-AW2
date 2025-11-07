import express from 'express'
import dotenv from 'dotenv'
import { readFile, writeFile } from 'fs/promises'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

// ===== MIDDLEWARE CORS =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  
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

// === RUTAS ===

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

// POST: crear orden de compra
app.post('/orders', async (req, res) => {
  const { user, items } = req.body

  if (!user || !items || items.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' })
  }

  let currentUser = users.find(u => u.email === user.email)
  
  if (!currentUser) {
    currentUser = {
      id: users.length + 1,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: 'customer'
    }
    users.push(currentUser)
    await writeFile('./data/users.json', JSON.stringify(users, null, 2))
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
})

// POST: agregar un nuevo usuario
app.post('/users', async (req, res) => {
  const newUser = req.body
  newUser.id = users.length + 1
  newUser.role = 'customer'
  users.push(newUser)
  await writeFile('./data/users.json', JSON.stringify(users, null, 2))
  res.status(201).json({ message: 'Usuario creado', user: newUser })
})

// POST: registrar una venta
app.post('/sales', async (req, res) => {
  const { userId, productId, quantity } = req.body
  const user = users.find(u => u.id === userId)
  const product = products.find(p => p.id === productId)

  if (!user || !product) {
    return res.status(400).json({ error: 'Usuario o producto inválido' })
  }

  const newSale = {
    id: sales.length + 1,
    userId,
    productId,
    quantity,
    total: product.price * quantity,
    date: new Date().toISOString(),
  }

  sales.push(newSale)
  await writeFile('./data/sales.json', JSON.stringify(sales, null, 2))
  res.status(201).json({ message: 'Venta registrada', sale: newSale })
})

// PUT: actualizar precio de un producto
app.put('/products/:id', async (req, res) => {
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

// DELETE: eliminar usuario (si no tiene ventas)
app.delete('/users/:id', async (req, res) => {
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