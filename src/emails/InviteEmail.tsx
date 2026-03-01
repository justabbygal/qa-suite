import { Button, Section, Text, Link } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./components/EmailLayout";

export interface InviteEmailProps {
  inviterName: string;
  organizationName: string;
  inviteLink: string;
  role: "Owner" | "Admin" | "User";
  expiresInDays?: number;
}

const styles = {
  heading: {
    color: "#0a0a0a",
    fontSize: "22px",
    fontWeight: "700",
    letterSpacing: "-0.02em",
    lineHeight: "1.3",
    margin: "0 0 16px",
  },
  body: {
    color: "#3f3f46",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 16px",
  },
  roleChip: {
    display: "inline-block",
    backgroundColor: "#f4f4f5",
    border: "1px solid #e4e4e7",
    borderRadius: "4px",
    color: "#0a0a0a",
    fontSize: "13px",
    fontWeight: "600",
    padding: "2px 8px",
  },
  ctaSection: {
    margin: "32px 0",
    textAlign: "center" as const,
  },
  button: {
    backgroundColor: "#0a0a0a",
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600",
    padding: "12px 28px",
    textDecoration: "none",
    display: "inline-block",
  },
  expiryBox: {
    backgroundColor: "#fafafa",
    border: "1px solid #e4e4e7",
    borderLeft: "3px solid #0a0a0a",
    borderRadius: "4px",
    padding: "12px 16px",
    margin: "24px 0 0",
  },
  expiryText: {
    color: "#52525b",
    fontSize: "13px",
    lineHeight: "1.5",
    margin: "0",
  },
  fallbackText: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "16px 0 0",
  },
  fallbackLink: {
    color: "#0a0a0a",
    wordBreak: "break-all" as const,
  },
};

export function InviteEmail({
  inviterName,
  organizationName,
  inviteLink,
  role,
  expiresInDays = 7,
}: InviteEmailProps) {
  const previewText = `${inviterName} invited you to join ${organizationName} on Fruition QA Suite`;

  return (
    <EmailLayout previewText={previewText}>
      <Text style={styles.heading}>
        You&apos;ve been invited to join {organizationName}
      </Text>

      <Text style={styles.body}>
        <strong>{inviterName}</strong> has invited you to join{" "}
        <strong>{organizationName}</strong> on Fruition QA Suite as{" "}
        <span style={styles.roleChip}>{role}</span>.
      </Text>

      <Text style={styles.body}>
        Click the button below to accept the invitation and set up your account.
      </Text>

      <Section style={styles.ctaSection}>
        <Button href={inviteLink} style={styles.button}>
          Accept Invitation
        </Button>
      </Section>

      <Section style={styles.expiryBox}>
        <Text style={styles.expiryText}>
          <strong>This invitation expires in {expiresInDays} days.</strong>{" "}
          After that, you&apos;ll need to request a new invite from{" "}
          {inviterName} or another team admin.
        </Text>
      </Section>

      <Text style={styles.fallbackText}>
        If the button above doesn&apos;t work, copy and paste this link into
        your browser:
        <br />
        <Link href={inviteLink} style={styles.fallbackLink}>
          {inviteLink}
        </Link>
      </Text>
    </EmailLayout>
  );
}

// Default export for React Email preview
export default function InviteEmailPreview() {
  return (
    <InviteEmail
      inviterName="Alex Johnson"
      organizationName="Fruition"
      inviteLink="https://app.fruition.com/invite/accept?token=abc123"
      role="Admin"
      expiresInDays={7}
    />
  );
}
