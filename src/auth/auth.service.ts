import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { UserService } from '../users/user.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    constructor(private readonly userService: UserService) {}

    async validateUser(email: string, password: string) {
        const user = await this.userService.findByEmail(email);
        
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if user is inactive
        if (user.status === 'inactive') {
            this.logger.debug(`User ${email} is inactive`);
            throw new UnauthorizedException('User account is inactive');
        }

        // No enviamos el password en la respuesta
        const { password: _, ...result } = user;
        return result;
    }
} 