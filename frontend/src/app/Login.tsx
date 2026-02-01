import React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { TextField, Button, Box, Paper, Typography } from '@mui/material'
import { login } from '../services/auth.service'
import { useAuth } from '../contexts/AuthContext'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export default function Login() {
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) })
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  async function onSubmit(values: any) {
    try {
      await login(values.email, values.password)
      refreshUser()
      navigate('/')
    } catch (e: any) {
      alert(e?.response?.data?.error || e.message || 'Login failed')
    }
  }

  return (
    <Box display="flex" height="100vh" alignItems="center" justifyContent="center">
      <Paper sx={{ width: 420, p: 4 }}>
        <Typography variant="h5" mb={2}>Admin Login</Typography>
        <form onSubmit={handleSubmit(onSubmit)}>
          <TextField fullWidth label="Email" margin="normal" autoComplete="username" {...register('email')} />
          <TextField fullWidth label="Password" type="password" margin="normal" autoComplete="current-password" {...register('password')} />
          <Box mt={2} display="flex" justifyContent="flex-end">
            <Button type="submit" variant="contained">Sign in</Button>
          </Box>
        </form>
      </Paper>
    </Box>
  )
}

