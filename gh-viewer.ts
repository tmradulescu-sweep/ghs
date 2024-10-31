import { $ } from "bun";

export interface PR {
  state: string;
  statusCheckRollup: StatusCheckRollup[];
  title: string;
  reviewRequests: ReviewRequests[];
  reviewDecision: string;
  isDraft: boolean;
  url: string;
}

export interface StatusCheckRollup {
  __typename: string;
  completedAt: string;
  conclusion: string;
  detailsUrl: string;
  name: string;
  startedAt: string;
  status: string;
  workflowName: string;
}

export interface ReviewRequests {
  __typename: string;
  name?: string;
  slug?: string;
  login?: string;
}

export type CliActionsType = "VIEW" | "OPEN";

export interface CliAction {
  type: CliActionsType;
  params: string[];
}

async function main() {
  let action = parseArgs();
  switch (action.type) {
    case "OPEN":
      await open(parseInt(action.params[0]));
      break;
    default:
      await view();
      break;
  }
}

function parseArgs(): CliAction {
  const args = Bun.argv;
  let pr_id: number | null = null;
  for (const arg of args) {
    try {
      pr_id = parseInt(arg);
    } catch (e) {
      pr_id = null;
    }
  }

  if (pr_id) {
    return {
      type: "OPEN",
      params: [(pr_id - 1).toString()],
    };
  }
  return { type: "VIEW", params: [] };
}

async function open(pr_id: number) {
  const prs = await getCurrentPR();
  await $`gh pr view ${prs[pr_id].url} --web`;
}

async function view() {
  const prs = await getCurrentPR();

  for (let index = 0; index < prs.length; index++) {
    const pr = prs[index];
    const pr_status = getPRStatus(pr);
    const reviews = getPRWaitingReviews(pr);
    const msg =
      pr_status.status !== "ERROR"
        ? pr_status.status === "SUCCESS"
          ? "🟢"
          : "⏲️"
        : `❌`;

    const approbation =
      pr.reviewDecision === "APPROVED"
        ? `[\x1b[01;32mAPPROVED\x1b[01;0m]`
        : `[\x1b[01;31m${pr.reviewDecision}\x1b[01;0m]`;

    const prefix = pr.isDraft ? "[DRAFT] " : "";

    console.log(`\x1b[1m${index + 1}. ${prefix}${pr.title} - ${msg}\x1b[01;0m`);

    // CI section
    if (pr_status.messages.length > 0) {
      console.log(" • Failing jobs : ");
      for (let message of pr_status.messages) {
        console.write("  ");
        console.log(` • ❌ ${message}`);
      }
    }

    // Review section

    if (!pr.isDraft) {
      console.write(" • ");
      await $`printf "${approbation}"`;
      console.log(" Still waiting for :");
      for (let message of reviews) {
        console.write("  ");
        console.log(message);
      }
    }

    console.log("");
  }
}

async function getCurrentPR(): Promise<PR[]> {
  const prs =
    await $`gh pr list --author "@me" --json "url,state,statusCheckRollup,title,reviewRequests,reviewDecision,isDraft" | jq "."`.text();

  return JSON.parse(prs);
}

type PRStatus = "SUCCESS" | "ERROR" | "IN_PROGRESS";

interface PRStatusDetails {
  messages: string[];
  status: PRStatus;
}

function getPRStatus(pr: PR): PRStatusDetails {
  const status = pr.statusCheckRollup.map((statusCheckRollup) => {
    return { ccl: statusCheckRollup.conclusion, name: statusCheckRollup.name };
  });
  for (let curStatus of status) {
    if (curStatus.ccl === "IN_PROGRESS") {
      return {
        messages: [`${curStatus.name}`],
        status: "IN_PROGRESS",
      };
    }
  }
  for (let curStatus of status) {
    if (curStatus.ccl === "ERROR" || curStatus.ccl === "FAILURE") {
      return {
        messages: [`${curStatus.name}`],
        status: "ERROR",
      };
    }
  }
  return {
    messages: [],
    status: "SUCCESS",
  };
}

function getPRWaitingReviews(pr: PR): string[] {
  const requests = [];

  for (let request of pr.reviewRequests) {
    if (request.__typename === "User") {
      if (request.login) {
        requests.push(` • ✍ ${request.login}`);
      }
    } else {
      if (request.name) {
        requests.push(` • ✍ ${request.name}`);
      }
    }
  }

  return requests;
}

await main();
