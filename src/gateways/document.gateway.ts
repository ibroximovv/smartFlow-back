import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'documents',
})
export class DocumentGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DocumentGateway.name);
  private userSockets: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      this.userSockets.set(userId, client);
      this.logger.log(`User ${userId} connected with socket ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = Array.from(this.userSockets.entries())
      .find(([, socket]) => socket.id === client.id)?.[0];

    if (userId) {
      this.userSockets.delete(userId);
      this.logger.log(`User ${userId} disconnected`);
    }
  }

  /**
   * Broadcast document status change
   */
  notifyDocumentStatusChange(documentId: string, status: string, details: any) {
    this.server.emit('document:statusChanged', {
      documentId,
      status,
      timestamp: new Date(),
      ...details,
    });
  }

  /**
   * Notify specific user
   */
  notifyUser(userId: string, eventName: string, data: any) {
    const socket = this.userSockets.get(userId);
    if (socket) {
      socket.emit(eventName, data);
    }
  }

  /**
   * Notify all connected users
   */
  broadcastNotification(eventName: string, data: any) {
    this.server.emit(eventName, {
      timestamp: new Date(),
      ...data,
    });
  }

  /**
   * Join a room for specific document
   */
  @SubscribeMessage('joinDocument')
  handleJoinDocument(client: Socket, data: { documentId: string }) {
    client.join(`document:${data.documentId}`);
    this.logger.log(`Client ${client.id} joined document room: ${data.documentId}`);
  }

  /**
   * Notify document observers
   */
  notifyDocumentObservers(documentId: string, eventName: string, data: any) {
    this.server.to(`document:${documentId}`).emit(eventName, {
      documentId,
      timestamp: new Date(),
      ...data,
    });
  }
}
