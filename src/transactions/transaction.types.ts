import { ApiProperty } from "@nestjs/swagger";

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
  relatedUserTransactionId?: string;
  office?: string;
  account_name?: string;
}

export class TransactionDto {
  @ApiProperty({ example: '123456789' })
  id: string | number;

  @ApiProperty({ enum: ['deposit', 'withdraw'] })
  type: 'deposit' | 'withdraw';

  @ApiProperty({ example: 100.50 })
  amount: number;

  @ApiProperty({ example: 'Aceptado' })
  status: string;

  @ApiProperty({ example: '2025-05-01T12:00:00.000Z' })
  date_created: string;

  @ApiProperty({ example: 'Depósito de cliente' })
  description: string;

  @ApiProperty({ required: false })
  payment_method_id?: string;

  @ApiProperty({ required: false, example: 'payer@example.com' })
  payer_email?: string;

  // Si PayerIdentification es una clase/DTO también, úsala aquí
  // Si es solo una interfaz, quizás necesites definirla como clase DTO también o anidarla
  // @ApiProperty({ required: false, type: PayerIdentificationDto })
  // payer_identification?: PayerIdentificationDto; // Asumiendo que creas PayerIdentificationDto

  @ApiProperty({ required: false })
  external_reference?: string;

  @ApiProperty({ required: false })
  cbu?: string;

  @ApiProperty({ required: false })
  wallet_address?: string;

  @ApiProperty({ required: false })
  receiver_id?: string;

  @ApiProperty({ required: false })
  idCliente?: string | number;

  @ApiProperty({ required: false })
  reference_transaction?: string;

  @ApiProperty({ required: false, example: 'OFICINA_XYZ' })
  office?: string;
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
  office?: string;
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
