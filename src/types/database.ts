/**
 * Hand-maintained Supabase Database types aligned with
 * supabase/migrations/20261008120000_initial_schema.sql
 *
 * Regenerate later with `supabase gen types` once a linked project exists.
 */

import type { GameStatus, RoundKind } from "@/types/game";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type IsoTimestamptz = string;

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          join_code: string;
          title: string;
          status: GameStatus;
          current_round_id: string | null;
          current_question_id: string | null;
          created_at: IsoTimestamptz;
          updated_at: IsoTimestamptz;
        };
        Insert: {
          id?: string;
          join_code: string;
          title?: string;
          status?: GameStatus;
          current_round_id?: string | null;
          current_question_id?: string | null;
          created_at?: IsoTimestamptz;
          updated_at?: IsoTimestamptz;
        };
        Update: {
          id?: string;
          join_code?: string;
          title?: string;
          status?: GameStatus;
          current_round_id?: string | null;
          current_question_id?: string | null;
          created_at?: IsoTimestamptz;
          updated_at?: IsoTimestamptz;
        };
        Relationships: [];
      };
      game_hosts: {
        Row: {
          game_id: string;
          host_token_hash: string;
          created_at: IsoTimestamptz;
        };
        Insert: {
          game_id: string;
          host_token_hash: string;
          created_at?: IsoTimestamptz;
        };
        Update: {
          game_id?: string;
          host_token_hash?: string;
          created_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "game_hosts_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: true;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          display_score: number;
          created_at: IsoTimestamptz;
        };
        Insert: {
          id?: string;
          game_id: string;
          name: string;
          display_score?: number;
          created_at?: IsoTimestamptz;
        };
        Update: {
          id?: string;
          game_id?: string;
          name?: string;
          display_score?: number;
          created_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "teams_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      team_sessions: {
        Row: {
          team_id: string;
          session_token_hash: string;
          created_at: IsoTimestamptz;
        };
        Insert: {
          team_id: string;
          session_token_hash: string;
          created_at?: IsoTimestamptz;
        };
        Update: {
          team_id?: string;
          session_token_hash?: string;
          created_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "team_sessions_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: true;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      rounds: {
        Row: {
          id: string;
          game_id: string;
          position: number;
          title: string;
          kind: RoundKind;
          planned_question_count: number;
          created_at: IsoTimestamptz;
        };
        Insert: {
          id?: string;
          game_id: string;
          position: number;
          title?: string;
          kind?: RoundKind;
          planned_question_count?: number;
          created_at?: IsoTimestamptz;
        };
        Update: {
          id?: string;
          game_id?: string;
          position?: number;
          title?: string;
          kind?: RoundKind;
          planned_question_count?: number;
          created_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "rounds_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          id: string;
          game_id: string;
          round_id: string;
          position: number;
          prompt: string;
          media_url: string | null;
          point_value: number;
          results_published_at: IsoTimestamptz | null;
          created_at: IsoTimestamptz;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_id: string;
          position: number;
          prompt: string;
          media_url?: string | null;
          point_value?: number;
          results_published_at?: IsoTimestamptz | null;
          created_at?: IsoTimestamptz;
        };
        Update: {
          id?: string;
          game_id?: string;
          round_id?: string;
          position?: number;
          prompt?: string;
          media_url?: string | null;
          point_value?: number;
          results_published_at?: IsoTimestamptz | null;
          created_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "questions_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
        ];
      };
      question_secrets: {
        Row: {
          question_id: string;
          correct_answer: string;
          grading_notes: string | null;
        };
        Insert: {
          question_id: string;
          correct_answer: string;
          grading_notes?: string | null;
        };
        Update: {
          question_id?: string;
          correct_answer?: string;
          grading_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "question_secrets_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: true;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      answers: {
        Row: {
          id: string;
          game_id: string;
          question_id: string;
          team_id: string;
          answer_text: string;
          submitted_at: IsoTimestamptz;
          updated_at: IsoTimestamptz;
          locked_at: IsoTimestamptz | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          question_id: string;
          team_id: string;
          answer_text: string;
          submitted_at?: IsoTimestamptz;
          updated_at?: IsoTimestamptz;
          locked_at?: IsoTimestamptz | null;
        };
        Update: {
          id?: string;
          game_id?: string;
          question_id?: string;
          team_id?: string;
          answer_text?: string;
          submitted_at?: IsoTimestamptz;
          updated_at?: IsoTimestamptz;
          locked_at?: IsoTimestamptz | null;
        };
        Relationships: [
          {
            foreignKeyName: "answers_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "answers_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      answer_grades: {
        Row: {
          answer_id: string;
          is_correct: boolean | null;
          points_awarded: number;
          graded_at: IsoTimestamptz | null;
        };
        Insert: {
          answer_id: string;
          is_correct?: boolean | null;
          points_awarded?: number;
          graded_at?: IsoTimestamptz | null;
        };
        Update: {
          answer_id?: string;
          is_correct?: boolean | null;
          points_awarded?: number;
          graded_at?: IsoTimestamptz | null;
        };
        Relationships: [
          {
            foreignKeyName: "answer_grades_answer_id_fkey";
            columns: ["answer_id"];
            isOneToOne: true;
            referencedRelation: "answers";
            referencedColumns: ["id"];
          },
        ];
      };
      wagers: {
        Row: {
          id: string;
          game_id: string;
          question_id: string;
          team_id: string;
          amount: number;
          locked_at: IsoTimestamptz | null;
          revealed_at: IsoTimestamptz | null;
          created_at: IsoTimestamptz;
          updated_at: IsoTimestamptz;
        };
        Insert: {
          id?: string;
          game_id: string;
          question_id: string;
          team_id: string;
          amount: number;
          locked_at?: IsoTimestamptz | null;
          revealed_at?: IsoTimestamptz | null;
          created_at?: IsoTimestamptz;
          updated_at?: IsoTimestamptz;
        };
        Update: {
          id?: string;
          game_id?: string;
          question_id?: string;
          team_id?: string;
          amount?: number;
          locked_at?: IsoTimestamptz | null;
          revealed_at?: IsoTimestamptz | null;
          created_at?: IsoTimestamptz;
          updated_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "wagers_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wagers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wagers_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      score_events: {
        Row: {
          id: string;
          game_id: string;
          team_id: string;
          question_id: string | null;
          round_id: string | null;
          delta: number;
          reason: string;
          published_at: IsoTimestamptz | null;
          created_at: IsoTimestamptz;
        };
        Insert: {
          id?: string;
          game_id: string;
          team_id: string;
          question_id?: string | null;
          round_id?: string | null;
          delta: number;
          reason: string;
          published_at?: IsoTimestamptz | null;
          created_at?: IsoTimestamptz;
        };
        Update: {
          id?: string;
          game_id?: string;
          team_id?: string;
          question_id?: string | null;
          round_id?: string | null;
          delta?: number;
          reason?: string;
          published_at?: IsoTimestamptz | null;
          created_at?: IsoTimestamptz;
        };
        Relationships: [
          {
            foreignKeyName: "score_events_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "score_events_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "score_events_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "score_events_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      game_status: GameStatus;
      round_kind: RoundKind;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
