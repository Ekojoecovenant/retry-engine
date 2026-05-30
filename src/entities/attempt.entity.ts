import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RetryRequest } from './request.entity';

export enum AttemptStatusEnum {
  pending = 'pending',
  success = 'success',
  failed = 'failed',
}

@Entity('attempts')
export class RetryAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  requestId!: string;

  @Column()
  attemptNumber!: number;

  @Column({
    type: 'varchar',
    default: AttemptStatusEnum.pending,
  })
  status!: AttemptStatusEnum;

  @Column({ nullable: true, type: 'int' })
  responseCode?: number;

  @Column({ nullable: true, type: 'text' })
  errorMessage?: string;

  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  @CreateDateColumn()
  startedAt!: Date;

  @Column({ nullable: true, type: 'datetime' })
  finishedAt?: Date;

  @ManyToOne(() => RetryRequest, (request) => request.attempts)
  @JoinColumn({ name: 'requestId' })
  request?: RetryRequest;
}