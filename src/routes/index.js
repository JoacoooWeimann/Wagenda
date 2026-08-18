import { Router } from 'express'
const router = Router()

router.get('/', (req, res) => {
  res.render('index', { title: 'My First App with Node.js' })
})

router.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' })
})

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us' })
})

export default router