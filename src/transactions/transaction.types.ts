export interface IpnNotification {
  topic: string;
  id: string;
  data?: {
    resource: string;
    topic: string;
  };
}

export interface DepositData {
  cbu: string;
  amount: number;
  idTransferencia: string;
  dateCreated?: string;
  paymentMethod?: string;
  email?: string; // Añadido para soportar el email en los depósitos externos
}


export interface Transaction {
  id: string | number;
  type: 'deposit' | 'withdraw';
  amount: number;
  status?: 'Pending' | 'Aceptado' | 'approved' | string;
  date_created?: string;
  description?: string;
  payment_method_id?: string;
  payer_id?: string | number;
  payer_email?: string;
  payer_identification?: {
    type?: string;
    number?: string;
  } | null;
  cbu?: string;
  wallet_address?: string;
  external_reference?: string | null;
  receiver_id?: string;
  idCliente?: string | number;
  reference_transaction?: string;
}

export interface PaymentData {
  id: string | number;
  description: string;
  amount: number;
  status?: string;
  date_created?: string;
  date_approved?: string;
  date_last_updated?: string;
  money_release_date?: string;
  status_detail?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  payer_id?: string | number;
  payer_email?: string;
  payer_identification?: {
    type?: string;
    number?: string;
  } | null;
  receiver_id?: string;
  bank_transfer_id?: number;
  transaction_details?: {
    acquirer_reference?: string | null;
    bank_transfer_id?: number;
    external_resource_url?: string | null;
    financial_institution?: string;
    installment_amount?: number;
    net_received_amount?: number;
    overpaid_amount?: number;
    payable_deferral_period?: string | null;
    payment_method_reference_id?: string | null;
    total_paid_amount?: number;
    transaction_id?: string;
  } | null;
  additional_info?: {
    tracking_id?: string;
    items?: Array<{
      id?: string;
      title?: string;
      description?: string;
      quantity?: number;
      unit_price?: number;
    }>;
    payer?: {
      registration_date?: string;
    };
    shipments?: {
      receiver_address?: {
        street_name?: string;
        street_number?: string;
        zip_code?: string;
        city_name?: string;
        state_name?: string;
      };
    };
  } | null;
  external_reference?: string | null;
  fee_details?: Array<{
    type?: string;
    amount?: number;
    fee_payer?: string;
  }>;
}
