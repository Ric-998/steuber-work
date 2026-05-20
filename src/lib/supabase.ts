import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hdemkyonurqfcohhfbgj.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkZW1reW9udXJxZmNvaGhmYmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMDY0MTksImV4cCI6MjA5MDc4MjQxOX0.c1JxaDQ_w8ZAVd-yRmwmEnoBp-R6wf8UtJ8QAKOquMQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
