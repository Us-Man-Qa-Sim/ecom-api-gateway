// DI tokens for the three gRPC ClientProxy instances registered by GrpcModule.
// Kept in one file so consumers do not accidentally use a string literal that
// drifts from the one passed to ClientsModule.registerAsync.
export const USER_GRPC_PACKAGE = 'USER_GRPC_PACKAGE';
export const PRODUCT_GRPC_PACKAGE = 'PRODUCT_GRPC_PACKAGE';
export const ORDER_GRPC_PACKAGE = 'ORDER_GRPC_PACKAGE';
