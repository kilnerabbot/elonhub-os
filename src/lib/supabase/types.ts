// Hand-authored to match supabase/migrations/0001_init.sql. Once the
// project is provisioned, regenerate with:
//   supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
// and reconcile any drift against this file.

export type AppRole =
  | "super_admin"
  | "director"
  | "sales_manager"
  | "salesperson"
  | "project_manager"
  | "employee"
  | "finance"
  | "support_agent"
  | "hr"
  | "client";

export type LeadStatus = "new" | "contacted" | "qualified" | "disqualified" | "converted";
export type PipelineStage =
  | "new" | "contacted" | "qualified" | "discovery" | "proposal" | "negotiation" | "won" | "lost";
export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
export type ProjectStage =
  | "discovery" | "planning" | "design" | "development" | "testing"
  | "client_review" | "launch" | "handover" | "support";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void";

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Tables: {
      organisations: {
        Row: {
          id: string;
          name: string;
          vat_number: string | null;
          currency: string;
          vat_rate: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["organisations"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["organisations"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          full_name: string;
          role: AppRole;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          org_id: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          org_id: string;
          legal_name: string;
          trading_name: string | null;
          registration_number: string | null;
          vat_number: string | null;
          industry: string | null;
          website: string | null;
          address: string | null;
          owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["customers"]["Row"]> & {
          org_id: string;
          legal_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          org_id: string;
          reference: string;
          company_name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          source: string;
          industry: string | null;
          location: string | null;
          owner_id: string | null;
          score: number;
          status: LeadStatus;
          notes: string | null;
          converted_opportunity_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["leads"]["Row"]> & {
          org_id: string;
          reference: string;
          company_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Row"]>;
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          org_id: string;
          lead_id: string | null;
          customer_id: string | null;
          name: string;
          stage: PipelineStage;
          value: number;
          probability: number;
          expected_close_date: string | null;
          owner_id: string | null;
          lost_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["opportunities"]["Row"]> & {
          org_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["opportunities"]["Row"]>;
        Relationships: [];
      };
      quotes: {
        Row: {
          id: string;
          org_id: string;
          opportunity_id: string | null;
          customer_id: string;
          number: string;
          status: QuoteStatus;
          subtotal: number;
          vat_amount: number;
          total: number;
          payment_terms: string | null;
          valid_until: string | null;
          owner_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["quotes"]["Row"]> & {
          org_id: string;
          customer_id: string;
          number: string;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          sales_order_id: string | null;
          customer_id: string;
          name: string;
          code: string;
          stage: ProjectStage;
          manager_id: string | null;
          start_date: string | null;
          end_date: string | null;
          budget_amount: number;
          estimated_hours: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & {
          org_id: string;
          customer_id: string;
          name: string;
          code: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          name: string;
          description: string | null;
          assignee_id: string | null;
          priority: "low" | "medium" | "high" | "urgent";
          due_date: string | null;
          estimated_hours: number | null;
          status: TaskStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & {
          org_id: string;
          project_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      time_entries: {
        Row: {
          id: string;
          org_id: string;
          project_id: string;
          task_id: string | null;
          user_id: string;
          entry_date: string;
          hours: number;
          billable: boolean;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["time_entries"]["Row"]> & {
          org_id: string;
          project_id: string;
          user_id: string;
          hours: number;
        };
        Update: Partial<Database["public"]["Tables"]["time_entries"]["Row"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          org_id: string;
          customer_id: string;
          project_id: string | null;
          quote_id: string | null;
          number: string;
          status: InvoiceStatus;
          subtotal: number;
          vat_amount: number;
          total: number;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["invoices"]["Row"]> & {
          org_id: string;
          customer_id: string;
          number: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          org_id: string;
          invoice_id: string;
          amount: number;
          paid_at: string;
          method: string | null;
          reference: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & {
          org_id: string;
          invoice_id: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          org_id: string;
          actor_id: string | null;
          table_name: string;
          record_id: string;
          action: "insert" | "update" | "delete";
          before: Record<string, unknown> | null;
          after: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
  };
}
