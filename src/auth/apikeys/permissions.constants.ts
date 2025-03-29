/**
 * Constantes de permisos para el sistema de API Keys
 */

export const API_PERMISSIONS = {
  // Permisos para Zendesk
  ZENDESK_CREATE_TICKET: 'zendesk:create-ticket',
  ZENDESK_READ_TICKETS: 'zendesk:read-tickets',
  ZENDESK_UPDATE_TICKET: 'zendesk:update-ticket',
  ZENDESK_CREATE_AGENT: "zendesk:create-agent",
  ZENDESK_DELETE_AGENT: 'zendesk:delete-agent',

  // Permisos para Accounts
  ACCOUNTS_READ_CBUS: 'accounts:read-cbus',

  // Permisos para Transacciones
  TRANSACTIONS_DEPOSIT: 'transactions:deposit',
  TRANSACTIONS_WITHDRAW: 'transactions:withdraw',

  // Otros permisos se pueden añadir aquí
}; 