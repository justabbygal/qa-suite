import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

export interface EmailLayoutProps {
  previewText: string;
  children: React.ReactNode;
}

const styles = {
  html: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  body: {
    backgroundColor: "#f4f4f5",
    margin: "0",
    padding: "0",
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    padding: "0",
    maxWidth: "560px",
    borderRadius: "8px",
    border: "1px solid #e4e4e7",
  },
  header: {
    backgroundColor: "#0a0a0a",
    borderRadius: "8px 8px 0 0",
    padding: "24px 40px",
  },
  headerLogo: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: "700",
    letterSpacing: "-0.02em",
    margin: "0",
  },
  content: {
    padding: "40px",
  },
  footer: {
    padding: "0 40px 32px",
  },
  divider: {
    borderColor: "#e4e4e7",
    margin: "0 0 24px",
  },
  footerText: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0",
  },
};

export function EmailLayout({ previewText, children }: EmailLayoutProps) {
  return (
    <Html lang="en" style={styles.html}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Text style={styles.headerLogo}>Fruition QA Suite</Text>
          </Section>

          {/* Main content */}
          <Section style={styles.content}>{children}</Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              Fruition &mdash; AI-native QA tooling for modern teams.
              <br />
              If you did not expect this email, you can safely ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
