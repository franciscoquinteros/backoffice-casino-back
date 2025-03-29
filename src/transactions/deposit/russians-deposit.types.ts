export interface RussiansDepositData {
    cbu: string;
    amount: number;
    idTransferencia: string;
    dateCreated?: string; // Opcional, si "los rusos" pueden enviar la fecha
    idCliente?: string | number;
  }
