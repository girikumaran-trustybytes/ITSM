import React from 'react'
import { Box, Typography, Button } from '@mui/material'
import { useNavigate } from 'react-router-dom'

export default function Unauthorized() {
  const nav = useNavigate()
  return (
    <Box display="flex" height="100vh" alignItems="center" justifyContent="center" flexDirection="column">
      <Typography variant="h4">403 — Forbidden</Typography>
      <Typography variant="body1" sx={{ mt: 1 }}>You don't have access to view this page.</Typography>
      <Button sx={{ mt: 2 }} variant="contained" onClick={() => nav(-1)}>Go Back</Button>
    </Box>
  )
}

