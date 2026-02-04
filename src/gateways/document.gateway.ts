import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApprovalService } from 'src/api/v1/document/approval.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/documents',
  transports: ['websocket'],
})
export class DocumentGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DocumentGateway.name);
  private userSockets: Map<string, Socket> = new Map();
  private socketToUser: Map<string, string> = new Map();

  constructor(
    private jwtService: JwtService,
    @Inject(forwardRef(() => ApprovalService))
    private approvalService: ApprovalService
  ) { }

  afterInit(server: Server) {
    this.logger.log('✅ WebSocket Gateway initialized (WebSocket only)');
  }

  async handleConnection(client: Socket) {
    try {
      this.logger.log(`🔌 Client attempting to connect: ${client.id}`);

      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token as string ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        client.handshake.headers?.['token'] as string;

      if (!token) {
        this.logger.warn(`⚠️ No token provided for ${client.id}`);
        client.emit('error', { message: 'Authentication token required' });
        client.disconnect();
        return;
      }

      const decoded = await this.jwtService.verifyAsync(token);
      const userId = decoded.id;

      if (!userId) {
        this.logger.warn(`⚠️ Invalid token payload for ${client.id}`);
        client.emit('error', { message: 'Invalid token' });
        client.disconnect();
        return;
      }

      // Eski socketni almashtirish
      const existingSocket = this.userSockets.get(userId);
      if (existingSocket && existingSocket.id !== client.id) {
        this.logger.log(`🔄 User ${userId} reconnecting, removing old socket`);
        this.socketToUser.delete(existingSocket.id);
        existingSocket.disconnect(true);
      }

      (client as any).userId = userId;
      (client as any).user = decoded;
      this.userSockets.set(userId, client);
      this.socketToUser.set(client.id, userId);

      this.logger.log(`✅ User ${userId} (${decoded.role}) authenticated and connected`);

      client.emit('connected', {
        message: 'Successfully authenticated',
        socketId: client.id,
        user: {
          id: userId,
          role: decoded.role
        },
        timestamp: new Date()
      });

    } catch (error) {
      this.logger.error(`❌ Authentication failed for ${client.id}:`, error.message);
      client.emit('error', {
        message: 'Authentication failed',
        details: error.message
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.socketToUser.get(client.id);

    if (userId) {
      const currentSocket = this.userSockets.get(userId);
      if (currentSocket?.id === client.id) {
        this.userSockets.delete(userId);
        this.logger.log(`❌ User ${userId} disconnected`);
      }
      this.socketToUser.delete(client.id);
    } else {
      this.logger.log(`❌ Unknown client ${client.id} disconnected`);
    }
  }

  @SubscribeMessage('test')
  handleTest(client: Socket, data: any) {
    const userId = (client as any).userId;
    this.logger.log(`📨 Test from user ${userId}:`, data);

    client.emit('testResponse', {
      message: 'Test received!',
      data,
      userId,
      timestamp: new Date()
    });
  }

  @SubscribeMessage('joinDocument')
  handleJoinDocument(client: Socket, data: { documentId: string }) {
    const userId = (client as any).userId;
    const room = `document:${data.documentId}`;

    client.join(room);
    this.logger.log(`📂 User ${userId} joined ${room}`);

    client.emit('joinedDocument', {
      documentId: data.documentId,
      message: 'Joined successfully',
      timestamp: new Date()
    });

    client.to(room).emit('userJoinedDocument', {
      documentId: data.documentId,
      userId,
      timestamp: new Date()
    });
  }

  @SubscribeMessage('leaveDocument')
  handleLeaveDocument(client: Socket, data: { documentId: string }) {
    const userId = (client as any).userId;
    const room = `document:${data.documentId}`;

    client.leave(room);
    this.logger.log(`📂 User ${userId} left ${room}`);

    client.to(room).emit('userLeftDocument', {
      documentId: data.documentId,
      userId,
      timestamp: new Date()
    });
  }

  @SubscribeMessage('triggerDocumentCheck')
  async handleTriggerCheck(client: Socket) {
    const userId = (client as any).userId;
    const userRole = (client as any).user?.role;

    if (userRole !== 'ADMIN' && userRole !== 'SUPER_ADMIN') {
      client.emit('error', {
        message: 'Permission denied. Only admins can trigger notifications'
      });
      return;
    }

    this.logger.log(`🔔 User ${userId} (${userRole}) manually triggered document check`);

    try {
      const notifications = await this.approvalService.notifyDocumentForChecking();

      client.emit('notificationTriggered', {
        success: true,
        message: 'Notifications sent',
        count: notifications.length,
        timestamp: new Date()
      });

    } catch (error) {
      this.logger.error('❌ Error triggering notifications:', error);
      client.emit('error', {
        message: 'Failed to send notifications',
        details: error.message
      });
    }
  }

  notifyUserForDocumentCheck(
    userId: string,
    notification: {
      documentId: string;
      documentType: string;
      serialNumber: string;
      status: string;
      role: string;
      message: string;
      currentStep?: number;
      totalSteps?: number;
    }
  ): boolean {
    const socket = this.userSockets.get(userId);

    if (socket) {
      socket.emit('documentCheckNotification', {
        ...notification,
        timestamp: new Date()
      });
      this.logger.log(`📨 Sent notification to user ${userId} for document ${notification.serialNumber}`);
      return true;
    } else {
      this.logger.warn(`⚠️ User ${userId} is not connected (offline)`);
      return false;
    }
  }

  async notifyWorkflowUsers(
    documentId: string,
    documentType: string,
    serialNumber: string,
    status: string,
    currentStep: number,
    workflowSteps: Array<{ stepOrder: number; role: string; label: string }>,
    usersByRole: Map<string, string[]>
  ) {
    this.logger.log(`🔔 Notifying workflow users for document ${serialNumber}`);
    this.logger.log(`📍 Status: ${status}, Current step: ${currentStep}, Total steps: ${workflowSteps.length}`);

    let notifiedCount = 0;
    let failedCount = 0;

    const targetStep = workflowSteps.find(step => step.stepOrder === currentStep);

    if (!targetStep) {
      this.logger.warn(`⚠️ No step found with stepOrder ${currentStep}`);
      return { notifiedCount: 0, failedCount: 0 };
    }

    this.logger.log(`🎯 Target step: ${targetStep.label} (Role: ${targetStep.role}, Order: ${targetStep.stepOrder})`);

    const userIds = usersByRole.get(targetStep.role) || [];
    
    this.logger.log(`👥 Found ${userIds.length} users with role ${targetStep.role}`);

    for (const userId of userIds) {
      const success = this.notifyUserForDocumentCheck(userId, {
        documentId,
        documentType,
        serialNumber,
        status,
        role: targetStep.role,
        message: `📄 New document "${serialNumber}" is waiting for ${targetStep.label}`,
        currentStep: targetStep.stepOrder,
        totalSteps: workflowSteps.length
      });

      if (success) {
        notifiedCount++;
      } else {
        failedCount++;
      }
    }

    this.logger.log(
      `📊 Workflow notification result: ${notifiedCount} sent, ${failedCount} failed (offline users)`
    );

    return { notifiedCount, failedCount };
  }

  broadcastDocumentCheckNotifications(
    notifications: Array<{
      documentId: string;
      userId: string;
      role: string;
      message: string;
      serialNumber?: string;
      documentType?: string;
      status?: string;
    }>
  ) {
    this.logger.log(`📢 Broadcasting ${notifications.length} notifications...`);

    let sentCount = 0;
    let failedCount = 0;

    for (const notification of notifications) {
      const success = this.notifyUserForDocumentCheck(
        notification.userId,
        {
          documentId: notification.documentId,
          documentType: notification.documentType || '',
          serialNumber: notification.serialNumber || '',
          status: notification.status || '',
          role: notification.role,
          message: notification.message
        }
      );

      if (success) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    this.logger.log(
      `📊 Broadcast result: ${sentCount} sent, ${failedCount} failed (offline users)`
    );

    return { sentCount, failedCount, total: notifications.length };
  }

  notifyDocumentStatusChange(documentId: string, status: string, details: any) {
    this.logger.log(`📢 Broadcasting status change for document ${documentId}: ${status}`);
    
    this.server.emit('document:statusChanged', {
      documentId,
      status,
      timestamp: new Date(),
      ...details,
    });
  }

  notifyUser(userId: string, eventName: string, data: any) {
    const socket = this.userSockets.get(userId);
    
    if (socket) {
      socket.emit(eventName, {
        timestamp: new Date(),
        ...data
      });
      this.logger.log(`📨 Sent ${eventName} to user ${userId}`);
    } else {
      this.logger.warn(`⚠️ Cannot notify user ${userId} - not connected`);
    }
  }

  broadcastNotification(eventName: string, data: any) {
    this.logger.log(`📢 Broadcasting event: ${eventName}`);
    
    this.server.emit(eventName, {
      timestamp: new Date(),
      ...data,
    });
  }

  notifyDocumentObservers(documentId: string, eventName: string, data: any) {
    const room = `document:${documentId}`;
    this.logger.log(`📢 Notifying room ${room} with event: ${eventName}`);
    
    this.server.to(room).emit(eventName, {
      documentId,
      timestamp: new Date(),
      ...data,
    });
  }

  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }
}