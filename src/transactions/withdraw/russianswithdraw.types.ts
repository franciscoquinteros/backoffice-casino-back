export interface WithdrawData {
  amount: number;
  wallet_address: string;
  dateCreated?: string;
  withdraw_method: string;
  idCliente?: string | number; // Añade esta línea
}