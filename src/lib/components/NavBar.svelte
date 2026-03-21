<script lang="ts">
	import { enhance } from '$app/forms';
	import type { User } from '@supabase/supabase-js';

	let { user, pendingCount = 0 } = $props<{ user: User | null; pendingCount?: number }>();
</script>

<nav class="navbar">
	<div class="navbar-inner">
		<a href="/" class="brand">
			<span class="brand-icon">🏺</span>
			<span class="brand-name">Pottery Tracker</span>
		</a>

		<div class="nav-links">
			<a href="/" class="nav-link">My Pieces</a>
			<a href="/upload" class="nav-link upload-btn">+ Upload Photo</a>
			{#if pendingCount > 0}
				<a href="/review" class="nav-link review-link">
					Review
					<span class="review-badge">{pendingCount}</span>
				</a>
			{/if}
		</div>

		<div class="nav-user">
			{#if user}
				<span class="user-email">{user.email}</span>
				<form method="POST" action="/auth?/logout" use:enhance>
					<button type="submit" class="logout-btn">Sign out</button>
				</form>
			{/if}
		</div>
	</div>
</nav>

<style>
	.navbar {
		background: white;
		border-bottom: 1px solid #e8e0d8;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.navbar-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1rem;
		height: 60px;
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 1.125rem;
		color: #2c1810;
		flex-shrink: 0;
	}

	.brand-icon {
		font-size: 1.5rem;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
	}

	.nav-link {
		font-size: 0.9375rem;
		color: #5a4035;
		font-weight: 500;
		padding: 0.375rem 0.75rem;
		border-radius: 6px;
		transition: background 0.15s;
	}

	.nav-link:hover {
		background: #f5efe8;
	}

	.upload-btn {
		background: #c0622c;
		color: white !important;
	}

	.upload-btn:hover {
		background: #a8521f !important;
	}

	.review-link {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.review-badge {
		background: #c0622c;
		color: white;
		font-size: 0.6875rem;
		font-weight: 700;
		border-radius: 10px;
		padding: 0.1rem 0.4rem;
		line-height: 1.4;
	}

	.nav-user {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-left: auto;
		min-width: 0;
	}

	.user-email {
		font-size: 0.8125rem;
		color: #7a5c4e;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.logout-btn {
		background: none;
		border: 1px solid #e0d5cc;
		border-radius: 6px;
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		color: #5a4035;
		transition: all 0.15s;
	}

	.logout-btn:hover {
		background: #f5efe8;
		border-color: #c0622c;
	}

	@media (max-width: 600px) {
		.navbar-inner {
			height: auto;
			flex-wrap: wrap;
			padding: 0.625rem 1rem;
			gap: 0.5rem;
		}

		.brand { flex: 1; }

		.nav-user {
			margin-left: 0;
			gap: 0.5rem;
		}

		.user-email { display: none; }

		.nav-links {
			flex: none;
			width: 100%;
			order: 3;
			gap: 0.375rem;
			padding-bottom: 0.25rem;
		}

		.nav-link {
			font-size: 0.875rem;
			padding: 0.3rem 0.5rem;
		}
	}
</style>
