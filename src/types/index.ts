export interface Role {
  id: string
  name: 'admin' | 'mitarbeiter' | 'teamleiter' | 'support'
  permissions: Record<string, unknown>
}

export type FeedbackType = 'bug' | 'feature' | 'improvement' | 'other'
export type FeedbackStatus = 'open' | 'in_progress' | 'planned' | 'done' | 'rejected'
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical'

export interface FeedbackItem {
  id: string
  user_id: string | null
  type: FeedbackType
  title: string
  description: string
  status: FeedbackStatus
  priority: FeedbackPriority
  admin_response: string | null
  screenshot_url: string | null
  created_at: string
  updated_at: string
  users?: { full_name: string }
}

export interface UserProfile {
  id: string
  full_name: string
  phone?: string
  role_id: string
  is_active: boolean
  created_at: string
  home_address?: string
  home_lat?: number
  home_lng?: number
  roles?: Role
}

export interface Category {
  id: string
  name: string
  emoji: string
}

export interface Customer {
  id: string
  customer_type: 'privatperson' | 'firma'
  name: string              // Firmenname (firma) oder Vor-/Nachname (privatperson)
  contact_person?: string   // Ansprechpartner (hauptsächlich bei firma)
  email?: string
  phone?: string
  street?: string
  postal_code?: string
  city?: string
  address_supplement?: string
  notes?: string
  lexware_id?: string
  contract_type?: 'jahresvertrag' | 'einmalig'
}

export interface ObjectItem {
  id: string
  name: string
  address: string
  city: string
  postal_code?: string
  customer_id?: string
  notes?: string
  access_note?: string
  parking_note?: string
  floor_info?: string
  is_active: boolean
  object_number?: string
  address_supplement?: string
  lat?: number
  lng?: number
  objektleiter_id?: string | null
  objektleiter?: { id: string; full_name: string } | null
  customers?: Customer
}

export interface Contract {
  id: string
  customer_id?: string
  object_id?: string
  type: 'jahresvertrag' | 'einmalig'
  start_date?: string
  end_date?: string
  notes?: string
  created_at?: string
  customers?: Customer
  objects?: ObjectItem
}

export interface Task {
  id: string
  title: string
  description?: string
  interval: 'täglich' | 'wöchentlich' | 'monatlich' | 'quartalsweise' | 'einmalig'
  category_id?: string
  object_id?: string
  contract_id?: string
  default_assignee_id?: string
  categories?: Category
  objects?: ObjectItem
  contracts?: Contract
}

export interface TaskAssignment {
  id: string
  task_id: string
  user_id: string
  due_date: string
  status: 'offen' | 'in_arbeit' | 'erledigt' | 'problem' | 'vertretung'
  started_at?: string
  completed_at?: string
  travel_minutes?: number
  sort_order?: number
  substitute_id?: string
  tasks?: Task
}

export interface LeaveRequest {
  id: string
  user_id: string
  from_date: string
  to_date: string
  note?: string
  status: 'ausstehend' | 'genehmigt' | 'abgelehnt'
  approved_by?: string
  substitute_id?: string
  created_at: string
}

export type ServiceCluster = 'gebäudereinigung' | 'grünanlagenpflege' | 'weitere_leistungen'

export const CLUSTER_LABELS: Record<ServiceCluster, string> = {
  gebäudereinigung:   'Gebäudereinigung',
  grünanlagenpflege:  'Grünanlagenpflege',
  weitere_leistungen: 'Weitere Leistungen',
}

export const CLUSTER_ICONS: Record<ServiceCluster, string> = {
  gebäudereinigung:   'apartment',
  grünanlagenpflege:  'park',
  weitere_leistungen: 'handyman',
}

export interface Service {
  id: string
  cluster: ServiceCluster
  name: string
  description?: string
  sort_order: number
  is_active: boolean
}

export interface ObjectService {
  id: string
  object_id: string
  service_id: string
  contract_id?: string
  order_type: 'jahresvertrag' | 'einmalig' | 'bei_bedarf'
  rhythm?: 'täglich' | 'wöchentlich' | '2-wöchentlich' | 'monatlich' | 'quartalsweise' | 'bei_bedarf'
  start_date?: string
  end_date?: string
  assignee_ids: string[]
  notes?: string
  is_active: boolean
  // Joins
  services?: Service
}
