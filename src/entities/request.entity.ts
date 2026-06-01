import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RetryAttempt } from './attempt.entity';

export enum RequestStatusEnum {
  pending = 'pending',
  retrying = 'retrying',
  completed = 'completed',
  failed = 'failed',
}

@Entity('requests')
export class RetryRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  url!: string;

  @Column({ default: 'GET' })
  method!: string;

  @Column({ nullable: true, type: 'text' })
  body?: string;

  @Column({
    type: 'varchar',
    default: RequestStatusEnum.pending,
  })
  status!: RequestStatusEnum;

  @Column({ default: 0 })
  attemptCount!: number;

  @Column({ type: 'integer', default: 1000 })
  backoffMs!: number; // base backoff

  @Column({ type: 'integer', default: 5 })
  maxRetries!: number;

  @Column({ type: 'datetime', nullable: true })
  nextRetryAt?: Date; // when the worker should pick it again

  @Column({ nullable: true, type: 'text' })
  lastError?: string | null; // last err msg

  @Column({ nullable: true, type: 'text' })
  result?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => RetryAttempt, (attempt) => attempt.request)
  attempts?: RetryAttempt[];
}
