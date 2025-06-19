export interface RussiansDepositData {
  cbu: string;
  amount: number;
  idTransferencia: string;
  dateCreated?: string;
  idCliente?: string | number;
  email?: string; // Añadido para soportar el email en los depósitos externos
  externalReference?: string;
  idTransaction?: string;
  idAgent?: string;
  payer_email?: string; // Añadido para soportar el email en los depósitos externos
  nombreDelTitular?: string; // Añadido para soportar el nombre del titular en los depósitos externos
  username?: string; // Username del usuario
  dni?: string; // DNI del usuario
}