export interface Role {
  id: string
  name: 'admin' | 'mitarbeiter' | 'objektleiter'
  permissions: Record<string, unknown>
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
  is_active: boolean
  object_number?: string
  address_supplement?: string
  lat?: number
  lng?: number
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
