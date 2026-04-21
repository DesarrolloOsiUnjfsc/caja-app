import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bxsfzucihnqjfiupumlu.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2Z6dWNpaG5xamZpdXB1bWx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTU5MDAsImV4cCI6MjA5MTA3MTkwMH0._kO8Co_fcJXPE89kxBAt7pgcSDot-MpfbpxLwHEFyCc'

export const supabase = createClient(supabaseUrl, supabaseKey)