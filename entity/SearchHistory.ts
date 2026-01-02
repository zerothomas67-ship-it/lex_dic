
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { User } from "./User";

@Entity("search_history")
@Index(["telegramId", "timestamp"]) // Speed up history tab
export class SearchHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  telegramId: string;

  @Column()
  @Index()
  term: string;

  @Column({ nullable: true })
  translation: string;

  @Column()
  sourceLang: string;

  @Column()
  targetLang: string;

  @Column({ nullable: true })
  category: string;

  @CreateDateColumn()
  timestamp: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "telegramId" })
  user: User;
}
